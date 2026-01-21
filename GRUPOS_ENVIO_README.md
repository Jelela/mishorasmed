# Implementación de Grupos de Envío

## Resumen
Sistema de agrupación de actos médicos para exportar/enviar separados, especialmente para "Círculo Católico".

## Archivos Modificados

### 1. SQL Migration
- **`supabase_migrations/001_create_report_groups.sql`**
  - Función `seed_user_report_groups_for_user_hospital()`: Crea grupos automáticamente
  - Trigger `seed_report_groups_after_medical_acts`: Se ejecuta después de crear medical_acts
  - Trigger `seed_report_groups_after_user_hospital`: Se ejecuta después de crear user_hospital

### 2. Frontend - Dashboard
- **`src/app/dashboard/page.tsx`**
  - Interfaces actualizadas: `MedicalAct`, `ReportGroup`, `HospitalWithActs`
  - Estados agregados: `editingGroupFor`, `newGroupName`, `creatingGroup`, `updatingActGroup`
  - Función `loadHospitalsAndActs()`: Ahora carga grupos de envío
  - Función `handleCreateGroup()`: Crea nuevos grupos
  - Función `handleUpdateActGroup()`: Asigna actos a grupos
  - UI agregada:
    - Sección "Grupos de envío" con chips mostrando grupos y cantidad de actos
    - Formulario para crear nuevos grupos
    - Dropdown en cada acto para asignarlo a un grupo

### 3. Frontend - Calendario
- **`src/app/dashboard/calendario/page.tsx`**
  - Función `loadClosingPeriodData()`: Modificada para agrupar por `user_report_group_id`
  - Query actualizada: Incluye `user_report_group_id` y join con `user_report_groups`
  - Modal de cierre: Muestra secciones por grupo con subtotales y total general
  - Logs de debug agregados

## Pasos para Ejecutar

### 1. Ejecutar SQL en Supabase
1. Abrir Supabase Dashboard
2. Ir a SQL Editor
3. Copiar y pegar el contenido de `supabase_migrations/001_create_report_groups.sql`
4. Ejecutar el script

### 2. Verificar Tabla
Asegurarse de que existe la tabla `user_report_groups`:
```sql
CREATE TABLE IF NOT EXISTS public.user_report_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_hospital_id uuid NOT NULL REFERENCES public.user_hospitals(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_hospital_id, name)
);
```

### 3. Verificar Columna en medical_acts
Asegurarse de que existe la columna `user_report_group_id`:
```sql
ALTER TABLE public.medical_acts 
ADD COLUMN IF NOT EXISTS user_report_group_id uuid 
REFERENCES public.user_report_groups(id) ON DELETE SET NULL;
```

## Pruebas

### Test 1: Agregar hospital "Círculo Católico"
1. Ir a Dashboard → "+ Agregar hospital"
2. Buscar y agregar "Círculo Católico"
3. **Verificar en consola del navegador:**
   - Debe aparecer: "Hospital: Círculo Católico"
   - Debe mostrar 5 grupos creados:
     - Guardias
     - Ayudantías + Cirugías + Partos
     - Policlínicas (con pacientes)
     - Policlínicas del Interior (con pacientes)
     - Procedimientos de Policlínica
4. **Verificar en UI:**
   - Debe aparecer la sección "Grupos de envío" con 5 chips azules
   - Cada chip muestra el nombre y cantidad de actos

### Test 2: Verificar asignación automática de actos
1. En el mismo hospital, verificar en consola:
   - Debe mostrar cada acto con su grupo asignado
   - Ejemplo: "Guardia -> Grupo: Guardias"
2. **Verificar en UI:**
   - Los actos deben tener dropdowns con el grupo seleccionado
   - Actos como "Guardia" deben estar en "Guardias"
   - Actos como "Cesárea" deben estar en "Ayudantías + Cirugías + Partos"

### Test 3: Agregar hospital normal (no Círculo Católico)
1. Agregar cualquier otro hospital
2. **Verificar:**
   - Debe crearse 1 grupo: "General"
   - Todos los actos deben estar asignados a "General"

### Test 4: Crear grupo personalizado
1. En cualquier hospital, click en "+ Agregar grupo"
2. Ingresar nombre: "Test Group"
3. Click en "✓"
4. **Verificar:**
   - Debe aparecer nuevo chip en "Grupos de envío"
   - Debe estar disponible en dropdowns de actos

### Test 5: Asignar acto a grupo
1. Seleccionar un acto
2. En el dropdown, seleccionar un grupo diferente
3. **Verificar:**
   - El acto debe actualizarse inmediatamente
   - El contador del grupo debe aumentar
   - El contador del grupo anterior debe disminuir

### Test 6: Resumen mensual agrupado
1. Ir a Calendario
2. Click en un evento de cierre (🔒 Cierre)
3. **Verificar:**
   - Debe mostrar secciones separadas por grupo
   - Cada sección tiene:
     - Header azul con nombre del grupo y subtotal
     - Tabla con actos del grupo
     - Subtotal del grupo
   - Al final: Total general sumando todos los grupos

## Debug Mode

Los logs de debug están activos en:
- `loadHospitalsAndActs()`: Muestra grupos y asignaciones en consola
- `loadClosingPeriodData()`: Muestra datos agrupados en consola

Para ver los logs:
1. Abrir DevTools (F12)
2. Ir a Console
3. Buscar mensajes que empiezan con "Hospital:", "Grupos:", "Actos:", "Datos agrupados"

## Notas Importantes

1. **Idempotencia**: La función SQL es idempotente. Puede ejecutarse múltiples veces sin duplicar grupos.

2. **Orden de ejecución**: Los triggers aseguran que:
   - Primero se crean `medical_acts` (trigger existente)
   - Luego se crean grupos y se asignan actos (nuevos triggers)

3. **Case-insensitive**: La detección de "Círculo Católico" es case-insensitive.

4. **Asignación por nombre**: Los actos se asignan automáticamente según su nombre (case-insensitive):
   - "Guardia", "Guardias" → Guardias
   - "Cesárea", "Laparoscopia", "Parto", "Cirugía", "Ayudantía" → Ayudantías + Cirugías + Partos
   - "Policlínica" → Policlínicas (con pacientes)
   - "Policlínica del Interior" → Policlínicas del Interior
   - Otros → Procedimientos de Policlínica

5. **Sin grupo**: Los actos sin `user_report_group_id` aparecen en sección "Sin agrupar" en el resumen.

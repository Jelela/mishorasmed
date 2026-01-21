-- ============================================
-- MIGRACIÓN: Grupos de envío (Report Groups)
-- ============================================
-- Esta migración crea:
-- 1. Función para seed automático de grupos
-- 2. Triggers para ejecutar seed después de crear hospital/actos
-- 
-- IMPORTANTE: Ejecutar este SQL en Supabase SQL Editor
-- ============================================

-- Función para crear grupos de envío automáticamente al agregar un hospital
CREATE OR REPLACE FUNCTION public.seed_user_report_groups_for_user_hospital(
  p_user_hospital_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_catalog_hospital_id uuid;
  v_hospital_name text;
  v_group_id uuid;
  v_act_id uuid;
  v_group_guardias_id uuid;
  v_group_ayudantias_id uuid;
  v_group_policlinicas_id uuid;
  v_group_policlinicas_interior_id uuid;
  v_group_procedimientos_id uuid;
  v_group_general_id uuid;
BEGIN
  -- Obtener user_id y catalog_hospital_id
  SELECT user_id, catalog_hospital_id
  INTO v_user_id, v_catalog_hospital_id
  FROM public.user_hospitals
  WHERE id = p_user_hospital_id;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user_hospital_id no encontrado: %', p_user_hospital_id;
  END IF;
  
  -- Obtener nombre del hospital
  SELECT name
  INTO v_hospital_name
  FROM public.hospital_catalog
  WHERE id = v_catalog_hospital_id;
  
  -- Determinar si es Círculo Católico (case-insensitive)
  IF LOWER(COALESCE(v_hospital_name, '')) = 'círculo católico' OR LOWER(COALESCE(v_hospital_name, '')) = 'circulo catolico' THEN
    -- CÍRCULO CATÓLICO: Crear 5 grupos específicos
    
    -- 1. Guardias
    INSERT INTO public.user_report_groups (user_id, user_hospital_id, name, sort_order, is_active)
    VALUES (v_user_id, p_user_hospital_id, 'Guardias', 1, true)
    ON CONFLICT (user_hospital_id, name) DO NOTHING
    RETURNING id INTO v_group_guardias_id;
    
    SELECT id INTO v_group_guardias_id
    FROM public.user_report_groups
    WHERE user_hospital_id = p_user_hospital_id AND name = 'Guardias';
    
    -- 2. Ayudantías + Cirugías + Partos
    INSERT INTO public.user_report_groups (user_id, user_hospital_id, name, sort_order, is_active)
    VALUES (v_user_id, p_user_hospital_id, 'Ayudantías + Cirugías + Partos', 2, true)
    ON CONFLICT (user_hospital_id, name) DO NOTHING
    RETURNING id INTO v_group_ayudantias_id;
    
    SELECT id INTO v_group_ayudantias_id
    FROM public.user_report_groups
    WHERE user_hospital_id = p_user_hospital_id AND name = 'Ayudantías + Cirugías + Partos';
    
    -- 3. Policlínicas (con pacientes)
    INSERT INTO public.user_report_groups (user_id, user_hospital_id, name, sort_order, is_active)
    VALUES (v_user_id, p_user_hospital_id, 'Policlínicas (con pacientes)', 3, true)
    ON CONFLICT (user_hospital_id, name) DO NOTHING
    RETURNING id INTO v_group_policlinicas_id;
    
    SELECT id INTO v_group_policlinicas_id
    FROM public.user_report_groups
    WHERE user_hospital_id = p_user_hospital_id AND name = 'Policlínicas (con pacientes)';
    
    -- 4. Policlínicas del Interior (con pacientes)
    INSERT INTO public.user_report_groups (user_id, user_hospital_id, name, sort_order, is_active)
    VALUES (v_user_id, p_user_hospital_id, 'Policlínicas del Interior (con pacientes)', 4, true)
    ON CONFLICT (user_hospital_id, name) DO NOTHING
    RETURNING id INTO v_group_policlinicas_interior_id;
    
    SELECT id INTO v_group_policlinicas_interior_id
    FROM public.user_report_groups
    WHERE user_hospital_id = p_user_hospital_id AND name = 'Policlínicas del Interior (con pacientes)';
    
    -- 5. Procedimientos de Policlínica
    INSERT INTO public.user_report_groups (user_id, user_hospital_id, name, sort_order, is_active)
    VALUES (v_user_id, p_user_hospital_id, 'Procedimientos de Policlínica', 5, true)
    ON CONFLICT (user_hospital_id, name) DO NOTHING
    RETURNING id INTO v_group_procedimientos_id;
    
    SELECT id INTO v_group_procedimientos_id
    FROM public.user_report_groups
    WHERE user_hospital_id = p_user_hospital_id AND name = 'Procedimientos de Policlínica';
    
    -- Asignar actos a grupos por nombre (solo si no tienen grupo asignado)
    FOR v_act_id IN 
      SELECT id FROM public.medical_acts
      WHERE user_hospital_id = p_user_hospital_id
        AND user_report_group_id IS NULL
    LOOP
      DECLARE
        v_act_name text;
      BEGIN
        SELECT name INTO v_act_name
        FROM public.medical_acts
        WHERE id = v_act_id;
        
        -- Asignar según nombre (case-insensitive)
        IF LOWER(v_act_name) LIKE '%guardia%' THEN
          UPDATE public.medical_acts
          SET user_report_group_id = v_group_guardias_id
          WHERE id = v_act_id;
        ELSIF LOWER(v_act_name) IN ('cesárea', 'cesarea', 'laparoscopia', 'parto', 'cirugía', 'cirugia') 
           OR LOWER(v_act_name) LIKE '%ayudantía%' 
           OR LOWER(v_act_name) LIKE '%ayudantia%' THEN
          UPDATE public.medical_acts
          SET user_report_group_id = v_group_ayudantias_id
          WHERE id = v_act_id;
        ELSIF LOWER(v_act_name) = 'policlínica' OR LOWER(v_act_name) = 'policlinica' THEN
          UPDATE public.medical_acts
          SET user_report_group_id = v_group_policlinicas_id
          WHERE id = v_act_id;
        ELSIF LOWER(v_act_name) LIKE '%policlínica%interior%' 
           OR LOWER(v_act_name) LIKE '%policlinica%interior%' THEN
          UPDATE public.medical_acts
          SET user_report_group_id = v_group_policlinicas_interior_id
          WHERE id = v_act_id;
        ELSE
          -- Por defecto, asignar a Procedimientos si no coincide con otros
          UPDATE public.medical_acts
          SET user_report_group_id = v_group_procedimientos_id
          WHERE id = v_act_id;
        END IF;
      END;
    END LOOP;
    
  ELSE
    -- OTROS HOSPITALES: Crear 1 grupo "General"
    INSERT INTO public.user_report_groups (user_id, user_hospital_id, name, sort_order, is_active)
    VALUES (v_user_id, p_user_hospital_id, 'General', 1, true)
    ON CONFLICT (user_hospital_id, name) DO NOTHING
    RETURNING id INTO v_group_general_id;
    
    SELECT id INTO v_group_general_id
    FROM public.user_report_groups
    WHERE user_hospital_id = p_user_hospital_id AND name = 'General';
    
    -- Asignar TODOS los actos sin grupo a "General"
    UPDATE public.medical_acts
    SET user_report_group_id = v_group_general_id
    WHERE user_hospital_id = p_user_hospital_id
      AND user_report_group_id IS NULL;
  END IF;
  
  -- Log para debug (visible en Supabase logs)
  RAISE NOTICE 'Grupos creados para user_hospital_id: %, hospital: %', p_user_hospital_id, v_hospital_name;
END;
$$;

-- Trigger para ejecutar seed de grupos después de crear medical_acts
-- Nota: Esto se ejecuta después del trigger que crea medical_acts
CREATE OR REPLACE FUNCTION public.trigger_seed_report_groups_after_medical_acts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Ejecutar seed de grupos para este hospital
  -- Solo si es una inserción nueva (no update)
  IF TG_OP = 'INSERT' THEN
    PERFORM public.seed_user_report_groups_for_user_hospital(NEW.user_hospital_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crear trigger (si no existe)
DROP TRIGGER IF EXISTS seed_report_groups_after_medical_acts ON public.medical_acts;
CREATE TRIGGER seed_report_groups_after_medical_acts
  AFTER INSERT ON public.medical_acts
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_seed_report_groups_after_medical_acts();

-- También crear trigger para cuando se inserta un user_hospital
-- (por si el trigger de medical_acts no se ejecuta en el momento correcto)
CREATE OR REPLACE FUNCTION public.trigger_seed_report_groups_after_user_hospital()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Esperar un momento para que se creen los medical_acts primero
  -- Luego ejecutar seed de grupos
  PERFORM pg_sleep(0.5); -- Esperar 500ms
  PERFORM public.seed_user_report_groups_for_user_hospital(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_report_groups_after_user_hospital ON public.user_hospitals;
CREATE TRIGGER seed_report_groups_after_user_hospital
  AFTER INSERT ON public.user_hospitals
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_seed_report_groups_after_user_hospital();

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_user_report_groups_user_hospital_id 
  ON public.user_report_groups(user_hospital_id);
CREATE INDEX IF NOT EXISTS idx_user_report_groups_user_id 
  ON public.user_report_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_medical_acts_user_report_group_id 
  ON public.medical_acts(user_report_group_id);

-- Crear constraint único para evitar duplicados (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_report_groups_user_hospital_id_name_key'
  ) THEN
    ALTER TABLE public.user_report_groups
    ADD CONSTRAINT user_report_groups_user_hospital_id_name_key 
    UNIQUE (user_hospital_id, name);
  END IF;
END $$;

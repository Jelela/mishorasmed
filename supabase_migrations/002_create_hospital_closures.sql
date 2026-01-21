-- Crear tabla hospital_closures (cabecera del cierre)
CREATE TABLE IF NOT EXISTS public.hospital_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_hospital_id uuid NOT NULL REFERENCES public.user_hospitals(id) ON DELETE CASCADE,
  period_start_calc date NOT NULL,
  period_end_calc date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  is_adjusted boolean DEFAULT false,
  adjust_reason text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_hospital_id, period_start_calc, period_end_calc)
);

-- Crear tabla hospital_closure_group_status (estado por grupo)
CREATE TABLE IF NOT EXISTS public.hospital_closure_group_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id uuid NOT NULL REFERENCES public.hospital_closures(id) ON DELETE CASCADE,
  user_report_group_id uuid REFERENCES public.user_report_groups(id) ON DELETE SET NULL,
  is_consolidated boolean DEFAULT false,
  consolidated_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(closure_id, user_report_group_id)
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_hospital_closures_user_hospital ON public.hospital_closures(user_hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospital_closures_periods ON public.hospital_closures(period_start_calc, period_end_calc);
CREATE INDEX IF NOT EXISTS idx_closure_group_status_closure ON public.hospital_closure_group_status(closure_id);
CREATE INDEX IF NOT EXISTS idx_closure_group_status_group ON public.hospital_closure_group_status(user_report_group_id);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.hospital_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_closure_group_status ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para hospital_closures
CREATE POLICY "Users can view their own closures"
  ON public.hospital_closures
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own closures"
  ON public.hospital_closures
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own closures"
  ON public.hospital_closures
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Políticas RLS para hospital_closure_group_status
CREATE POLICY "Users can view their own closure group status"
  ON public.hospital_closure_group_status
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hospital_closures
      WHERE hospital_closures.id = hospital_closure_group_status.closure_id
      AND hospital_closures.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own closure group status"
  ON public.hospital_closure_group_status
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hospital_closures
      WHERE hospital_closures.id = hospital_closure_group_status.closure_id
      AND hospital_closures.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own closure group status"
  ON public.hospital_closure_group_status
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.hospital_closures
      WHERE hospital_closures.id = hospital_closure_group_status.closure_id
      AND hospital_closures.user_id = auth.uid()
    )
  );

ALTER TABLE evidencia
    ADD COLUMN IF NOT EXISTS latitude
        NUMERIC(10, 7),

    ADD COLUMN IF NOT EXISTS longitude
        NUMERIC(10, 7),

    ADD COLUMN IF NOT EXISTS precisao_gps
        NUMERIC(10, 2),

    ADD COLUMN IF NOT EXISTS origem_coordenadas
        VARCHAR(10),

    ADD COLUMN IF NOT EXISTS data_captura_gps
        TIMESTAMPTZ;

ALTER TABLE evidencia
    ADD CONSTRAINT chk_evidencia_latitude
        CHECK (latitude BETWEEN -90 AND 90),

    ADD CONSTRAINT chk_evidencia_longitude
        CHECK (longitude BETWEEN -180 AND 180),

    ADD CONSTRAINT chk_evidencia_precisao
        CHECK (precisao_gps >= 0),

    ADD CONSTRAINT chk_evidencia_origem
        CHECK (
            origem_coordenadas IN (
                'GPS',
                'MANUAL'
            )
        ),

    ADD CONSTRAINT chk_evidencia_coordenadas
        CHECK (
            (latitude IS NULL AND longitude IS NULL)
            OR
            (latitude IS NOT NULL AND longitude IS NOT NULL)
        );
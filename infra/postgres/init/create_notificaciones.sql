-- Migration: create_notificaciones
-- Stores persisted in-app notifications for history and unread counts.

CREATE TABLE notificaciones (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER       NOT NULL
                    REFERENCES usuarios (id)
                    ON UPDATE CASCADE
                    ON DELETE CASCADE,
    type        VARCHAR(50)   NOT NULL,   -- NotificationEventType
    title       VARCHAR(255)  NOT NULL,
    body        TEXT          NOT NULL,
    oficio_id   INTEGER       NOT NULL
                    REFERENCES oficios (id)
                    ON UPDATE CASCADE
                    ON DELETE CASCADE,
    folio       VARCHAR(100)  NOT NULL,
    read        BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notificaciones_user_id    ON notificaciones (user_id);
CREATE INDEX idx_notificaciones_read       ON notificaciones (user_id, read);
CREATE INDEX idx_notificaciones_created_at ON notificaciones (created_at DESC);

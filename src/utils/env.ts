/**
 * Environment validation — fails fast at startup if required vars are missing.
 * File: src/utils/env.ts
 *
 * Call validateEnv() as the FIRST thing in server.ts and worker/index.ts.
 */

interface EnvSpec {
  key:      string;
  required: boolean;
  secret?:  boolean;   // mask value in logs
}

const API_VARS: EnvSpec[] = [
  { key: 'DATABASE_URL',    required: true,  secret: true  },
  { key: 'JWT_SECRET',      required: true,  secret: true  },
  { key: 'NODE_ENV',        required: false                 },
  { key: 'PORT',            required: false                 },
  { key: 'REDIS_URL',       required: false, secret: true  },
  { key: 'EMAIL_TRANSPORT', required: false                 },
  { key: 'APP_URL',         required: false                 },
  { key: 'STORAGE_LOCAL_PATH', required: false              },
  { key: 'TZ',              required: false                 },
];

const WORKER_VARS: EnvSpec[] = [
  { key: 'DATABASE_URL',    required: true,  secret: true  },
  { key: 'JWT_SECRET',      required: true,  secret: true  },
  { key: 'REDIS_URL',       required: false, secret: true  },
  { key: 'EMAIL_TRANSPORT', required: false                 },
  { key: 'SMTP_HOST',       required: false                 },
  { key: 'SMTP_USER',       required: false, secret: true  },
  { key: 'SMTP_PASS',       required: false, secret: true  },
  { key: 'SENDGRID_API_KEY',required: false, secret: true  },
  { key: 'APP_URL',         required: false                 },
  { key: 'TZ',              required: false                 },
];

function validate(vars: EnvSpec[], context: string): void {
  const missing: string[] = [];

  for (const spec of vars) {
    const value = process.env[spec.key];
    if (spec.required && !value) {
      missing.push(spec.key);
    }
  }

  if (missing.length > 0) {
    console.error(`\n[ENV] ❌ Missing required environment variables for ${context}:`);
    for (const key of missing) {
      console.error(`       - ${key}`);
    }
    console.error('\nSet these variables and restart.\n');
    process.exit(1);
  }

  // Warn about insecure JWT_SECRET in production
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.JWT_SECRET &&
    process.env.JWT_SECRET.length < 32
  ) {
    console.error('[ENV] ❌ JWT_SECRET must be at least 32 characters in production.');
    process.exit(1);
  }

  // Log present vars (mask secrets)
  console.log(`[ENV] ✓ Environment validated for ${context}`);
  for (const spec of vars) {
    const value = process.env[spec.key];
    if (value) {
      const display = spec.secret ? '***' : value;
      console.log(`      ${spec.key}=${display}`);
    }
  }
}

export function validateApiEnv():    void { validate(API_VARS,    'API');    }
export function validateWorkerEnv(): void { validate(WORKER_VARS, 'Worker'); }

#!/usr/bin/env python3
"""
Script para crear usuarios reales via API REST.
Uso: python3 infra/scripts/create_users.py
"""
import urllib.request
import urllib.error
import json

BASE = "http://localhost:3000/api/v1"

def post(path, body, token=None):
    data = json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read()), None
    except urllib.error.HTTPError as e:
        return None, json.loads(e.read())

def patch(path, body, token):
    data = json.dumps(body).encode()
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read()), None
    except urllib.error.HTTPError as e:
        return None, json.loads(e.read())

# Login como superadmin
res, err = post("/auth/login", {"email": "superadmin@demo.mx", "password": "password123"})
if err:
    print(f"ERROR login: {err}")
    exit(1)
TOKEN = res["token"]
print(f"Login OK — token obtenido")

# Unidades:
# 34 = Dirección General
# 35 = Dirección TICS
# 36 = Dirección Jurídica
# 41 = Dirección Administrativa

USUARIOS = [
    # (nombre, email, rol, unidad_id)
    ("Mariann Gonzalez Pliego Castillo", "mariann@demo.mx",    "DIRECTOR",   34),
    ("Fabian Montiel",                   "fabian@demo.mx",     "OPERATIVO",  34),
    ("Tania Huerta",                     "tania@demo.mx",      "SECRETARIA", 34),
    ("Carlos Tah",                       "carlos.tah@demo.mx", "DIRECTOR",   35),
    ("Andy Frank",                       "andy@demo.mx",       "OPERATIVO",  35),
    ("Mariela",                          "mariela@demo.mx",    "OPERATIVO",  35),
    ("Miguel",                           "miguel@demo.mx",     "OPERATIVO",  35),
    ("Emiliano",                         "emiliano@demo.mx",   "OPERATIVO",  35),
    ("Emanuel",                          "emanuel@demo.mx",    "OPERATIVO",  35),
    ("Gerardo",                          "gerardo@demo.mx",    "OPERATIVO",  35),
    ("Nohemy",                           "nohemy@demo.mx",     "OPERATIVO",  35),
    ("Victor",                           "victor@demo.mx",     "OPERATIVO",  35),
    ("Claudina",                         "claudina@demo.mx",   "OPERATIVO",  35),
    ("Oscar Gopar",                      "oscar@demo.mx",      "DIRECTOR",   36),
    ("Tania Juridico",                   "tania.jur@demo.mx",  "OPERATIVO",  36),
    ("Luis Juridico",                    "luis.jur@demo.mx",   "OPERATIVO",  36),
    ("Erika",                            "erika@demo.mx",      "OPERATIVO",  36),
    ("Raymundo Padilla",                 "raymundo@demo.mx",   "DIRECTOR",   41),
    ("Sharely",                          "sharely@demo.mx",    "OPERATIVO",  41),
    ("Jesus",                            "jesus@demo.mx",      "OPERATIVO",  41),
    ("Oliver",                           "oliver@demo.mx",     "OPERATIVO",  41),
]

MODULO_ID = 2  # supervision_eventos
created_ids = []

print(f"\nCreando {len(USUARIOS)} usuarios...")
for nombre, email, rol, unidad_id in USUARIOS:
    res, err = post("/admin/usuarios", {
        "nombre":     nombre,
        "email":      email,
        "password":   "password123",
        "rol":        rol,
        "oficina_id": unidad_id,
    }, TOKEN)
    if err:
        msg = err.get("message", str(err))
        if "Ya existe" in msg or "already" in msg.lower():
            print(f"  SKIP  {nombre} ({email}) — ya existe")
        else:
            print(f"  ERROR {nombre} ({email}): {msg}")
    else:
        uid = res["data"]["id"]
        created_ids.append(uid)
        print(f"  OK    {nombre} ({email}) → id={uid} rol={rol}")

print(f"\nAsignando módulo supervision_eventos a todos los usuarios...")
# Obtener IDs de todos los usuarios del script (incluyendo los ya existentes)
import urllib.request as ur

def get_user_id(email, token):
    req = ur.Request(f"{BASE}/admin/usuarios?search={email}&limit=5",
                     headers={"Authorization": f"Bearer {token}"})
    with ur.urlopen(req) as r:
        data = json.loads(r.read())
        for u in data.get("data", []):
            if u["email"] == email:
                return u["id"]
    return None

all_emails = [u[1] for u in USUARIOS]
assigned = 0
for email in all_emails:
    uid = get_user_id(email, TOKEN)
    if not uid:
        print(f"  SKIP  {email} — no encontrado")
        continue
    res, err = post(f"/admin/usuarios/{uid}/modulos/{MODULO_ID}", {}, TOKEN)
    if err:
        msg = err.get("message", str(err))
        if "ya está habilitado" in msg or "already" in msg.lower():
            print(f"  SKIP  {email} — módulo ya asignado")
        else:
            print(f"  ERROR {email}: {msg}")
    else:
        assigned += 1
        print(f"  OK    {email} → módulo asignado")

print(f"\nResumen: {len(created_ids)} usuarios creados, {assigned} módulos asignados.")

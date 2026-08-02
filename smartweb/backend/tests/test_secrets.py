"""Проверки: секретов со значением по умолчанию нет, без переменных — ошибка."""
import os, sys, subprocess, textwrap

def run(env, code):
    e = dict(os.environ); e.update(env)
    e.setdefault("DATABASE_URL", "postgresql://u:p@localhost/db")
    r = subprocess.run([sys.executable, "-c", textwrap.dedent(code)],
                       capture_output=True, text=True, env=e, cwd=os.getcwd())
    return r.returncode, r.stdout.strip(), r.stderr.strip()

fails = []
def check(name, cond, info=""):
    print(("OK   " if cond else "FAIL ") + name + ((" | " + info) if info and not cond else ""))
    if not cond: fails.append(name)

# 1. Без SECRET_KEY/JWT_SECRET подпись токена невозможна (ConfigError, не пустой ключ)
rc, out, err = run({"SECRET_KEY": "", "JWT_SECRET": ""}, """
    from app.config import ConfigError, settings
    try:
        settings.jwt_signing_key
        print("NO_ERROR")
    except ConfigError as e:
        print("CONFIG_ERROR")
""")
check("jwt_signing_key без секретов -> ConfigError", out == "CONFIG_ERROR", out + err)

# 2. Шифрование токенов интеграций без SECRET_KEY -> ConfigError, не «change-me»
rc, out, err = run({"SECRET_KEY": "", "JWT_SECRET": "x"}, """
    from app.config import ConfigError
    from app.services import crypto
    try:
        crypto.encrypt("token")
        print("NO_ERROR")
    except ConfigError:
        print("CONFIG_ERROR")
""")
check("crypto.encrypt без SECRET_KEY -> ConfigError", out == "CONFIG_ERROR", out + err)

# 3. Шифрование обратимо и шифртекст не содержит открытого токена
rc, out, err = run({"SECRET_KEY": "s1"}, """
    from app.services import crypto
    blob = crypto.encrypt("ya29.SECRET-REFRESH-TOKEN")
    print("PLAIN_LEAK" if "SECRET-REFRESH-TOKEN" in blob else "OPAQUE",
          crypto.decrypt(blob) == "ya29.SECRET-REFRESH-TOKEN")
""")
check("токен шифруется и расшифровывается", out == "OPAQUE True", out + err)

# 4. Токен, зашифрованный другим SECRET_KEY, не расшифровывается
rc, out, err = run({"SECRET_KEY": "s1"}, """
    from app.services import crypto
    print(crypto.encrypt("tok"))
""")
blob = out
rc, out, err = run({"SECRET_KEY": "s2"}, f"""
    from app.services import crypto
    print(crypto.decrypt({blob!r}))
""")
check("чужой SECRET_KEY не расшифровывает токен", out == "None", out + err)

# 5. Пароль администратора не зашит в код
rc, out, err = run({"ADMIN_PASSWORD": ""}, """
    from fastapi import HTTPException
    from app.routers.auth import admin_login, AdminLoginReq
    try:
        admin_login(AdminLoginReq(password="1on12026")); print("LET_IN")
    except HTTPException as e:
        print(e.status_code)
""")
check("старый пароль 1on12026 не пускает в админку", out == "503", out + err)

rc, out, err = run({"ADMIN_PASSWORD": "real-admin-pass"}, """
    from fastapi import HTTPException
    from app.routers.auth import admin_login, AdminLoginReq
    try:
        admin_login(AdminLoginReq(password="1on12026")); print("LET_IN")
    except HTTPException as e:
        print(e.status_code)
""")
check("при заданном ADMIN_PASSWORD старый пароль -> 401", out == "401", out + err)

rc, out, err = run({"ADMIN_PASSWORD": "real-admin-pass"}, """
    from app.routers.auth import admin_login, AdminLoginReq
    print(bool(admin_login(AdminLoginReq(password="real-admin-pass")).get("token")))
""")
check("верный ADMIN_PASSWORD выдаёт токен", out == "True", out + err)

print("\nПровалов:", len(fails), fails)
sys.exit(1 if fails else 0)

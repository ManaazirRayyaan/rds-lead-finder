"""Generate values for the single-admin authentication environment variables."""

import argparse
from getpass import getpass
from pathlib import Path
from secrets import token_hex

from pwdlib import PasswordHash


def update_env(path: Path, values: dict[str, str]) -> None:
    lines = path.read_text().splitlines() if path.exists() else []
    written: set[str] = set()
    output: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line else ""
        if key in values:
            if key not in written:
                output.append(f"{key}={values[key]}")
                written.add(key)
            continue
        output.append(line)
    if output and output[-1]:
        output.append("")
    for key, value in values.items():
        if key not in written:
            output.append(f"{key}={value}")
    path.write_text("\n".join(output).rstrip() + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the single-admin password hash and session secret.")
    parser.add_argument(
        "--write-env",
        action="store_true",
        help="also update backend/.env for local development",
    )
    args = parser.parse_args()

    password = getpass("Choose an admin password (12+ characters): ")
    confirmation = getpass("Confirm the admin password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    if len(password) < 12:
        raise SystemExit("Use at least 12 characters.")

    values = {
        "ADMIN_USERNAME": "admin",
        "ADMIN_PASSWORD_HASH": PasswordHash.recommended().hash(password),
        "SESSION_SECRET": token_hex(32),
    }
    if args.write_env:
        env_path = Path(__file__).resolve().parents[1] / ".env"
        update_env(env_path, values)
        print(f"\nUpdated {env_path}. Restart the backend before signing in.")
        return

    print("\nCopy these values to the Render environment (the password itself is not pasted into Render):")
    for key, value in values.items():
        print(f"{key}={value}")


if __name__ == "__main__":
    main()

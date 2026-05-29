from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage
from typing import Optional


def smtp_enabled() -> bool:
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_FROM"))


def send_email(to_email: Optional[str], subject: str, body: str) -> bool:
    if not to_email or not smtp_enabled():
        return False

    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    username = os.environ.get("SMTP_USERNAME", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    from_email = os.environ["SMTP_FROM"]
    use_tls = os.environ.get("SMTP_TLS", "true").lower() not in {"0", "false", "no"}

    message = EmailMessage()
    message["From"] = from_email
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            if use_tls:
                server.starttls()
            if username:
                server.login(username, password)
            server.send_message(message)
        return True
    except Exception:
        return False


def send_assignment_email(person, asset, assigned_on: str, expected_return_on: Optional[str]) -> bool:
    due_line = f"\nExpected return date: {expected_return_on}" if expected_return_on else ""
    return send_email(
        person["email"],
        f"Asset assigned: {asset['asset_tag']}",
        (
            f"Hello {person['full_name']},\n\n"
            f"The following asset has been assigned to you:\n\n"
            f"Asset tag: {asset['asset_tag']}\n"
            f"Asset name: {asset['name']}\n"
            f"Assigned on: {assigned_on}"
            f"{due_line}\n\n"
            "Please keep this email for your records."
        ),
    )


def send_return_email(person, asset, returned_on: str, return_condition: str) -> bool:
    return send_email(
        person["email"],
        f"Asset returned: {asset['asset_tag']}",
        (
            f"Hello {person['full_name']},\n\n"
            f"The following asset return has been recorded:\n\n"
            f"Asset tag: {asset['asset_tag']}\n"
            f"Asset name: {asset['name']}\n"
            f"Returned on: {returned_on}\n"
            f"Return condition: {return_condition}\n\n"
            "Thank you."
        ),
    )

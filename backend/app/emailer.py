from __future__ import annotations

import logging
import os
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError


def ses_region() -> str:
    return os.environ.get("AWS_SES_REGION") or os.environ.get("AWS_REGION") or "us-east-1"


def ses_sender() -> str:
    return os.environ.get("AWS_SES_FROM", "").strip()


def ses_enabled() -> bool:
    return bool(ses_sender())


def send_email(to_email: Optional[str], subject: str, body: str) -> bool:
    logger = logging.getLogger(__name__)

    if not to_email:
        logger.warning("send_email: no recipient address provided; skipping send")
        return False
    if not ses_enabled():
        logger.warning("send_email: Amazon SES not configured (AWS_SES_FROM missing); skipping send to %s", to_email)
        return False

    try:
        client = boto3.client("ses", region_name=ses_region())
        client.send_email(
            Source=ses_sender(),
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
            },
        )
        logger.info("send_email: Amazon SES message sent to %s subject=%s", to_email, subject)
        return True
    except (BotoCoreError, ClientError):
        logger.exception("send_email: Amazon SES failed to send email to %s", to_email)
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

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class MasterPayload(BaseModel):
    name: str = Field(min_length=1)


class StatusPayload(BaseModel):
    name: str = Field(min_length=1)
    kind: str = Field(pattern="^(available|assigned|maintenance|retired)$")
    sort_order: int = 100


class DepartmentPayload(BaseModel):
    name: str = Field(min_length=1)
    code: Optional[str] = None
    contact_email: Optional[str] = None


class PersonPayload(BaseModel):
    full_name: str = Field(min_length=1)
    person_type: str = Field(pattern="^(employee|consultant)$")
    email: Optional[str] = None
    phone: Optional[str] = None
    department_id: Optional[int] = None
    external_company: Optional[str] = None


class UserPayload(BaseModel):
    username: str = Field(min_length=1)
    full_name: str = Field(min_length=1)
    password: Optional[str] = None
    role: str = Field(pattern="^(admin|staff)$")
    department_id: Optional[int] = None
    person_id: Optional[int] = None


class AssetPayload(BaseModel):
    asset_tag: str = Field(min_length=1)
    name: str = Field(min_length=1)
    category_id: Optional[int] = None
    status_id: int
    location_id: Optional[int] = None
    serial_number: Optional[str] = None
    purchase_date: Optional[str] = None
    warranty_end: Optional[str] = None
    purchase_cost: Optional[float] = Field(default=None, ge=0)
    condition: str = "Good"
    notes: Optional[str] = None


class AssignmentPayload(BaseModel):
    asset_id: int
    person_id: int
    assigned_on: str
    expected_return_on: Optional[str] = None
    notes: Optional[str] = None


class ReturnPayload(BaseModel):
    returned_on: str
    return_condition: str = "Good"
    notes: Optional[str] = None


class BulkAssetUploadPayload(BaseModel):
    csv_text: str

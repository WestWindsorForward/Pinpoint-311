from __future__ import annotations

import csv
import io
from typing import Iterable

from app.models import ServiceRequest


def requests_to_csv(requests: Iterable[ServiceRequest]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "Request ID",
            "Title",
            "Status",
            "Priority",
            "Category",
            "Submitter Name",
            "Submitter Email",
            "Submitter Phone",
            "Address",
            "Department",
            "Assigned To",
            "Created At",
            "Updated At",
        ]
    )

    for request in requests:
        writer.writerow(
            [
                request.public_id,
                request.title,
                request.status.value,
                request.priority.value,
                request.category_code,
                request.submitter_name,
                request.submitter_email,
                request.submitter_phone,
                request.location_address,
                request.assigned_department,
                request.assigned_to.full_name if request.assigned_to else None,
                request.created_at.isoformat() if request.created_at else None,
                request.updated_at.isoformat() if request.updated_at else None,
            ]
        )

    return buffer.getvalue()

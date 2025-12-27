from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Float, Text, Boolean, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from app.db.session import Base


# Association table for ServiceDefinition-Department many-to-many
service_departments = Table(
    "service_departments",
    Base.metadata,
    Column("service_id", Integer, ForeignKey("service_definitions.id"), primary_key=True),
    Column("department_id", Integer, ForeignKey("departments.id"), primary_key=True)
)


# Association table for User-Department many-to-many
user_departments = Table(
    "user_departments",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("department_id", Integer, ForeignKey("departments.id"), primary_key=True)
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255))
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="staff")  # admin, staff
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Staff can be assigned to multiple departments
    departments = relationship(
        "Department",
        secondary=user_departments,
        back_populates="staff_members"
    )


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(Text)
    routing_email = Column(String(255))
    is_active = Column(Boolean, default=True)
    
    services = relationship(
        "ServiceDefinition",
        secondary=service_departments,
        back_populates="departments"
    )
    
    staff_members = relationship(
        "User",
        secondary=user_departments,
        back_populates="departments"
    )


class ServiceDefinition(Base):
    __tablename__ = "service_definitions"

    id = Column(Integer, primary_key=True, index=True)
    service_code = Column(String(50), unique=True, index=True, nullable=False)
    service_name = Column(String(100), nullable=False)
    description = Column(Text)
    icon = Column(String(50), default="AlertCircle")  # Lucide icon name
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Routing configuration
    routing_mode = Column(String(50), default="township")  # township, third_party, road_based
    routing_config = Column(JSON, default={})
    # For third_party: { "url": "...", "message": "..." }
    # For road_based: { 
    #   "default": "township|third_party", 
    #   "township_roads": ["Main St", ...],
    #   "county_roads": ["County Rd 1", ...],
    #   "third_party_url": "...", 
    #   "third_party_message": "..." 
    # }
    
    assigned_department_id = Column(Integer, ForeignKey("departments.id"))
    assigned_department = relationship("Department", foreign_keys=[assigned_department_id])
    
    departments = relationship(
        "Department",
        secondary=service_departments,
        back_populates="services"
    )


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id = Column(Integer, primary_key=True, index=True)
    service_request_id = Column(String(50), unique=True, index=True, nullable=False)
    
    # Service info
    service_code = Column(String(50), index=True, nullable=False)
    service_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    
    # Status
    status = Column(String(20), default="open", index=True)  # open, in_progress, closed
    priority = Column(Integer, default=5)  # 1-10
    
    # Location
    address = Column(String(500))
    lat = Column(Float)
    long = Column(Float)
    location = Column(Geometry("POINT", srid=4326))
    
    # Reporter info (PII - hidden from public)
    first_name = Column(String(100))
    last_name = Column(String(100))
    email = Column(String(255), nullable=False)
    phone = Column(String(50))
    
    # Metadata
    source = Column(String(50), default="resident_portal")  # resident_portal, phone, walk_in, email
    media_url = Column(String(500))
    
    # AI Analysis
    ai_analysis = Column(JSON)
    flagged = Column(Boolean, default=False)
    flag_reason = Column(String(255))
    
    # Timestamps
    requested_datetime = Column(DateTime(timezone=True), server_default=func.now())
    updated_datetime = Column(DateTime(timezone=True), onupdate=func.now())
    closed_datetime = Column(DateTime(timezone=True))
    
    # Staff notes
    staff_notes = Column(Text)
    assigned_to = Column(String(100))


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    township_name = Column(String(200), default="Your Township")
    logo_url = Column(String(500))
    favicon_url = Column(String(500))
    hero_text = Column(String(500), default="How can we help?")
    primary_color = Column(String(7), default="#6366f1")
    modules = Column(JSON, default={"ai_analysis": False, "sms_alerts": False})
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class SystemSecret(Base):
    __tablename__ = "system_secrets"

    id = Column(Integer, primary_key=True, index=True)
    key_name = Column(String(100), unique=True, index=True, nullable=False)
    key_value = Column(Text)  # Should be encrypted in production
    description = Column(String(255))
    is_configured = Column(Boolean, default=False)

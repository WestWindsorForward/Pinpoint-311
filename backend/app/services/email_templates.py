"""
Branded Email Templates for Township 311 System

Generates beautiful, responsive HTML email templates with township branding.
Pulls configuration from SystemSettings for logo, colors, and township name.
"""
from typing import Optional, Dict, Any
from datetime import datetime


def get_base_template(
    township_name: str,
    logo_url: Optional[str],
    primary_color: str = "#6366f1",
    content: str = "",
    footer_text: str = ""
) -> str:
    """
    Base responsive email template with township branding.
    Uses inline CSS for maximum email client compatibility.
    """
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{township_name} - 311 Service</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="margin: 0 auto; max-width: 600px;">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, {primary_color} 0%, #4338ca 100%); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
                            {f'<img src="{logo_url}" alt="{township_name}" style="height: 48px; margin-bottom: 16px;">' if logo_url else ''}
                            <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">{township_name}</h1>
                            <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">311 Service Portal</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="background-color: white; padding: 32px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                            {content}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px; text-align: center;">
                            <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">
                                {footer_text if footer_text else f"This is an automated message from {township_name} 311 Service."}
                            </p>
                            <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                                Please do not reply directly to this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""


def build_confirmation_email(
    township_name: str,
    logo_url: Optional[str],
    primary_color: str,
    request_id: str,
    service_name: str,
    description: str,
    address: Optional[str],
    portal_url: str
) -> Dict[str, str]:
    """
    Build email for new request confirmation.
    Returns dict with 'subject', 'html', and 'text' keys.
    """
    tracking_url = f"{portal_url}/track/{request_id}"
    
    content = f"""
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background-color: #dcfce7; border-radius: 50%; padding: 16px; margin-bottom: 16px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
            <h2 style="margin: 0 0 8px 0; color: #1e293b; font-size: 22px; font-weight: 600;">Request Received!</h2>
            <p style="margin: 0; color: #64748b; font-size: 15px;">Your report has been submitted successfully</p>
        </div>
        
        <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                        <span style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Request ID</span>
                        <p style="margin: 4px 0 0 0; color: {primary_color}; font-size: 18px; font-weight: 600;">#{request_id}</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                        <span style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Category</span>
                        <p style="margin: 4px 0 0 0; color: #1e293b; font-size: 15px; font-weight: 500;">{service_name}</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 12px 0;{' border-bottom: 1px solid #e2e8f0;' if address else ''}">
                        <span style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Description</span>
                        <p style="margin: 4px 0 0 0; color: #1e293b; font-size: 15px;">{description[:200]}{'...' if len(description) > 200 else ''}</p>
                    </td>
                </tr>
                {f'''
                <tr>
                    <td style="padding: 12px 0;">
                        <span style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Location</span>
                        <p style="margin: 4px 0 0 0; color: #1e293b; font-size: 15px;">{address}</p>
                    </td>
                </tr>
                ''' if address else ''}
            </table>
        </div>
        
        <div style="text-align: center;">
            <a href="{tracking_url}" style="display: inline-block; background-color: {primary_color}; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">Track Your Request</a>
            <p style="margin: 16px 0 0 0; color: #94a3b8; font-size: 13px;">
                or visit: <a href="{tracking_url}" style="color: {primary_color};">{tracking_url}</a>
            </p>
        </div>
    """
    
    html = get_base_template(
        township_name=township_name,
        logo_url=logo_url,
        primary_color=primary_color,
        content=content,
        footer_text=f"Thank you for helping make {township_name} a better place!"
    )
    
    text = f"""
Your Request Has Been Received!

Request ID: #{request_id}
Category: {service_name}
Description: {description[:200]}
{f"Location: {address}" if address else ""}

Track your request at: {tracking_url}

Thank you for helping make {township_name} a better place!
"""
    
    return {
        "subject": f"Request #{request_id} Received - {township_name}",
        "html": html,
        "text": text.strip()
    }


def build_status_update_email(
    township_name: str,
    logo_url: Optional[str],
    primary_color: str,
    request_id: str,
    service_name: str,
    old_status: str,
    new_status: str,
    completion_message: Optional[str],
    completion_photo_url: Optional[str],
    portal_url: str
) -> Dict[str, str]:
    """
    Build email for status update notification.
    Includes completion photo if provided (for closed requests).
    """
    tracking_url = f"{portal_url}/track/{request_id}"
    
    status_configs = {
        "open": {"label": "Open", "color": "#f59e0b", "bg": "#fef3c7", "icon": "circle"},
        "in_progress": {"label": "In Progress", "color": "#3b82f6", "bg": "#dbeafe", "icon": "clock"},
        "closed": {"label": "Resolved", "color": "#16a34a", "bg": "#dcfce7", "icon": "check-circle"}
    }
    
    status_config = status_configs.get(new_status, {"label": new_status.replace("_", " ").title(), "color": "#64748b", "bg": "#f1f5f9", "icon": "circle"})
    
    # Build completion photo section if available
    completion_photo_section = ""
    if completion_photo_url and new_status == "closed":
        completion_photo_section = f'''
        <div style="margin-bottom: 24px; text-align: center;">
            <p style="margin: 0 0 12px 0; color: #166534; font-size: 13px; font-weight: 600;">Completion Photo</p>
            <img src="{completion_photo_url}" alt="Completion photo" style="max-width: 100%; height: auto; border-radius: 12px; border: 2px solid #dcfce7; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        </div>
        '''
    
    content = f"""
        <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="margin: 0 0 8px 0; color: #1e293b; font-size: 22px; font-weight: 600;">Status Update</h2>
            <p style="margin: 0; color: #64748b; font-size: 15px;">Request #{request_id}</p>
        </div>
        
        <div style="background-color: {status_config['bg']}; border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
            <p style="margin: 0 0 8px 0; color: {status_config['color']}; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Current Status</p>
            <p style="margin: 0; color: {status_config['color']}; font-size: 24px; font-weight: 700;">{status_config['label']}</p>
        </div>
        
        <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                    <td style="padding: 8px 0;">
                        <span style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Category</span>
                        <p style="margin: 4px 0 0 0; color: #1e293b; font-size: 15px; font-weight: 500;">{service_name}</p>
                    </td>
                </tr>
            </table>
        </div>
        
        {f'''
        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 0 8px 8px 0; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0 0 4px 0; color: #166534; font-size: 13px; font-weight: 600;">Resolution Notes</p>
            <p style="margin: 0; color: #15803d; font-size: 15px;">{completion_message}</p>
        </div>
        ''' if completion_message and new_status == 'closed' else ''}
        
        {completion_photo_section}
        
        <div style="text-align: center;">
            <a href="{tracking_url}" style="display: inline-block; background-color: {primary_color}; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">View Request Details</a>
        </div>
    """
    
    html = get_base_template(
        township_name=township_name,
        logo_url=logo_url,
        primary_color=primary_color,
        content=content
    )
    
    text = f"""
Status Update for Request #{request_id}

Your request status has been updated to: {status_config['label']}

Category: {service_name}
{f"Resolution Notes: {completion_message}" if completion_message and new_status == 'closed' else ""}
{f"Completion Photo: {completion_photo_url}" if completion_photo_url and new_status == 'closed' else ""}

View details at: {tracking_url}
"""
    
    return {
        "subject": f"Request #{request_id} Status: {status_config['label']} - {township_name}",
        "html": html,
        "text": text.strip()
    }


def build_comment_email(
    township_name: str,
    logo_url: Optional[str],
    primary_color: str,
    request_id: str,
    service_name: str,
    comment_author: str,
    comment_content: str,
    portal_url: str
) -> Dict[str, str]:
    """
    Build email for new public comment notification.
    Uses table-based layout for email client compatibility.
    """
    tracking_url = f"{portal_url}/track/{request_id}"
    author_initial = comment_author[0].upper() if comment_author else "S"
    
    content = f"""
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background-color: #dbeafe; border-radius: 50%; width: 56px; height: 56px; line-height: 56px; margin-bottom: 16px;">
                <span style="color: #3b82f6; font-size: 24px;">💬</span>
            </div>
            <h2 style="margin: 0 0 8px 0; color: #1e293b; font-size: 22px; font-weight: 600;">New Update on Your Request</h2>
            <p style="margin: 0; color: {primary_color}; font-size: 15px; font-weight: 500;">Request #{request_id} • {service_name}</p>
        </div>
        
        <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
                <tr>
                    <td width="48" valign="top" style="padding-right: 12px;">
                        <div style="background-color: {primary_color}; color: white; width: 44px; height: 44px; border-radius: 50%; text-align: center; line-height: 44px; font-weight: 600; font-size: 18px;">
                            {author_initial}
                        </div>
                    </td>
                    <td valign="middle">
                        <p style="margin: 0 0 2px 0; color: #1e293b; font-size: 16px; font-weight: 600;">{comment_author}</p>
                        <p style="margin: 0; color: {primary_color}; font-size: 13px; font-weight: 500;">Staff Member</p>
                    </td>
                </tr>
            </table>
            
            <div style="background-color: white; border-radius: 8px; padding: 16px; border-left: 4px solid {primary_color};">
                <p style="margin: 0; color: #1e293b; font-size: 15px; line-height: 1.7;">"{comment_content}"</p>
            </div>
        </div>
        
        <div style="text-align: center;">
            <a href="{tracking_url}" style="display: inline-block; background-color: {primary_color}; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">View Full Conversation</a>
            <p style="margin: 16px 0 0 0; color: #94a3b8; font-size: 13px;">
                or visit: <a href="{tracking_url}" style="color: {primary_color};">{tracking_url}</a>
            </p>
        </div>
    """
    
    html = get_base_template(
        township_name=township_name,
        logo_url=logo_url,
        primary_color=primary_color,
        content=content,
        footer_text=f"You're receiving this because you submitted a request to {township_name}."
    )
    
    text = f"""
New Update on Your Request #{request_id}

{comment_author} (Staff) wrote:

"{comment_content}"

View the full conversation at: {tracking_url}
"""
    
    return {
        "subject": f"New Update on Request #{request_id} - {township_name}",
        "html": html,
        "text": text.strip()
    }


def build_sms_confirmation(request_id: str, township_name: str) -> str:
    """Build SMS message for request confirmation."""
    return f"{township_name} 311: Your request #{request_id} has been received. We'll notify you of updates."


def build_sms_status_update(request_id: str, new_status: str, township_name: str) -> str:
    """Build SMS message for status update."""
    status_text = {
        "open": "is now being reviewed",
        "in_progress": "is now being worked on",
        "closed": "has been resolved"
    }.get(new_status, f"status changed to {new_status}")
    
    return f"{township_name} 311: Request #{request_id} {status_text}."

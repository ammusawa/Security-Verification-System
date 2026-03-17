"""Send OTP email. Falls back to console if mail not configured.

Recipient: always the user's registered email (passed as to_email).
Sender: from MAIL_* in .env (the SMTP account used to send). OTPs go TO the user, not to the sender.
"""
from flask import current_app
from flask_mail import Message


def send_otp_email(to_email: str, otp_code: str, username: str = "") -> bool:
    """Send OTP to the given recipient. Sender is from config (MAIL_DEFAULT_SENDER)."""
    app = current_app
    subject = "Your login verification code"
    body = (
        f"Hello{f' {username}' if username else ''},\n\n"
        f"Your one-time verification code is: {otp_code}\n\n"
        "This code expires in 10 minutes. If you did not request this, please ignore.\n\n"
        "— Security Verification System"
    )
    if app.config.get("MAIL_SERVER"):
        try:
            mail = current_app.extensions.get("mail")
            if mail:
                app.logger.info("Sending OTP email to: %s (sender from config)", to_email)
                msg = Message(subject=subject, recipients=[to_email], body=body, sender=app.config.get("MAIL_DEFAULT_SENDER"))
                mail.send(msg)
                return True
        except Exception as e:
            app.logger.warning("Failed to send OTP email: %s", e)
            err_str = str(e).lower()
            if "534" in err_str or "application-specific password" in err_str:
                print("[OTP] Gmail requires an App Password: https://myaccount.google.com/apppasswords")
            elif "10060" in err_str or "connect error" in err_str or "timed out" in err_str or "connection refused" in err_str:
                print("[OTP] Cannot reach SMTP server (connection timeout/blocked). Try:")
                print("  1. Use port 465 with SSL: MAIL_PORT=465, MAIL_USE_SSL=true, MAIL_USE_TLS=false")
                print("  2. Allow outbound port 587 or 465 in firewall/antivirus")
                print("  3. Some networks block SMTP; try another network or VPN")
            if app.debug:
                print(f"[OTP] Code for {to_email}: {otp_code}")
                return True
            return False
    print(f"[OTP] To: {to_email} | Code: {otp_code}")
    return True


def send_demo_email(to_email: str, name: str, subject: str, content: str, demo_url: str) -> bool:
    """Send the admin-composed demo email to the requester, including the demo link."""
    app = current_app
    email_subject = subject or "Your SecureAuth Demo is Ready"
    body = (
        f"Hello {name},\n\n"
        f"Thank you for your interest in SecureAuth! Your personalized demo is ready.\n\n"
        f"{content}\n\n"
        f"View your demo here:\n{demo_url}\n\n"
        "If you have any questions, feel free to reply to this email.\n\n"
        "— The SecureAuth Team"
    )
    html_body = (
        f"<div style='font-family:sans-serif;max-width:600px;margin:0 auto;'>"
        f"<h2 style='color:#1e293b;'>Hello {name},</h2>"
        f"<p>Thank you for your interest in <strong>SecureAuth</strong>! Your personalized demo is ready.</p>"
        f"<div style='background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:1.25rem;margin:1.5rem 0;'>"
        f"{content}"
        f"</div>"
        f"<p style='text-align:center;margin:2rem 0;'>"
        f"<a href='{demo_url}' style='display:inline-block;padding:0.75rem 2rem;"
        f"background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;"
        f"font-weight:600;font-size:1rem;'>View Your Demo</a>"
        f"</p>"
        f"<p style='color:#64748b;font-size:0.875rem;'>Or copy this link: {demo_url}</p>"
        f"<hr style='border:none;border-top:1px solid #e2e8f0;margin:2rem 0;'/>"
        f"<p style='color:#94a3b8;font-size:0.8125rem;'>— The SecureAuth Team</p>"
        f"</div>"
    )
    if app.config.get("MAIL_SERVER"):
        try:
            mail = current_app.extensions.get("mail")
            if mail:
                app.logger.info("Sending demo email to: %s", to_email)
                msg = Message(
                    subject=email_subject,
                    recipients=[to_email],
                    body=body,
                    html=html_body,
                    sender=app.config.get("MAIL_DEFAULT_SENDER"),
                )
                mail.send(msg)
                return True
        except Exception as e:
            app.logger.warning("Failed to send demo email: %s", e)
            if app.debug:
                print(f"[DEMO] Demo email for {to_email}: {demo_url}")
                return True
            return False
    print(f"[DEMO] To: {to_email} | Subject: {email_subject} | Link: {demo_url}")
    return True


def send_subscription_approved_email(
    to_email: str,
    name: str,
    username: str,
    temp_password: str,
    login_url: str,
    app_name: str,
) -> bool:
    """Send the new app admin their login details after subscription approval."""
    app = current_app
    subject = "Your SecureAuth App Admin access is ready"
    body = (
        f"Hello {name},\n\n"
        "Your subscription request has been approved. You now have App Admin access to SecureAuth.\n\n"
        f"App: {app_name}\n"
        f"Login URL: {login_url}\n"
        f"Username: {username}\n"
        f"Temporary password: {temp_password}\n\n"
        "Sign in at the link above and change your password after your first login.\n\n"
        "— The SecureAuth Team"
    )
    html_body = (
        f"<div style='font-family:sans-serif;max-width:600px;margin:0 auto;'>"
        f"<h2 style='color:#1e293b;'>Hello {name},</h2>"
        f"<p>Your subscription request has been approved. You now have <strong>App Admin</strong> access to SecureAuth.</p>"
        f"<p><strong>App:</strong> {app_name}</p>"
        f"<p style='text-align:center;margin:2rem 0;'>"
        f"<a href='{login_url}' style='display:inline-block;padding:0.75rem 2rem;"
        f"background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;"
        f"font-weight:600;font-size:1rem;'>Sign in to your dashboard</a>"
        f"</p>"
        f"<p style='color:#64748b;font-size:0.875rem;'><strong>Username:</strong> {username}<br/><strong>Temporary password:</strong> <code style='background:#f1f5f9;padding:0.2rem 0.4rem;border-radius:4px;'>{temp_password}</code></p>"
        f"<p style='color:#64748b;font-size:0.875rem;'>Please change your password after your first login.</p>"
        f"<hr style='border:none;border-top:1px solid #e2e8f0;margin:2rem 0;'/>"
        f"<p style='color:#94a3b8;font-size:0.8125rem;'>— The SecureAuth Team</p>"
        f"</div>"
    )
    if app.config.get("MAIL_SERVER"):
        try:
            mail = current_app.extensions.get("mail")
            if mail:
                app.logger.info("Sending subscription-approved email to: %s", to_email)
                msg = Message(
                    subject=subject,
                    recipients=[to_email],
                    body=body,
                    html=html_body,
                    sender=app.config.get("MAIL_DEFAULT_SENDER"),
                )
                mail.send(msg)
                return True
        except Exception as e:
            app.logger.warning("Failed to send subscription-approved email: %s", e)
            if app.debug:
                print(f"[SUB] Approval email for {to_email}: login {login_url}, user {username}")
                return True
            return False
    print(f"[SUB] To: {to_email} | Login: {login_url} | User: {username} | Temp password: {temp_password}")
    return True


def send_password_reset_email(to_email: str, name: str, reset_url: str) -> bool:
    """Send password reset link to the user. Sender is from config."""
    app = current_app
    subject = "Reset your password"
    body = (
        f"Hello{f' {name}' if name else ''},\n\n"
        "You requested a password reset. Click the link below to set a new password:\n\n"
        f"{reset_url}\n\n"
        "This link expires in 1 hour. If you did not request this, you can ignore this email.\n\n"
        "— Security Verification System"
    )
    html_body = (
        f"<div style='font-family:sans-serif;max-width:600px;margin:0 auto;'>"
        f"<h2 style='color:#1e293b;'>Reset your password</h2>"
        f"<p>Hello{f' {name}' if name else ''},</p>"
        f"<p>You requested a password reset. Click the button below to set a new password:</p>"
        f"<p style='text-align:center;margin:2rem 0;'>"
        f"<a href='{reset_url}' style='display:inline-block;padding:0.75rem 2rem;"
        f"background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;"
        f"font-weight:600;font-size:1rem;'>Set new password</a>"
        f"</p>"
        f"<p style='color:#64748b;font-size:0.875rem;'>Or copy this link: {reset_url}</p>"
        f"<p style='color:#94a3b8;font-size:0.8125rem;'>This link expires in 1 hour.</p>"
        f"<hr style='border:none;border-top:1px solid #e2e8f0;margin:2rem 0;'/>"
        f"<p style='color:#94a3b8;font-size:0.8125rem;'>— Security Verification System</p>"
        f"</div>"
    )
    if app.config.get("MAIL_SERVER"):
        try:
            mail = current_app.extensions.get("mail")
            if mail:
                app.logger.info("Sending password reset email to: %s", to_email)
                msg = Message(
                    subject=subject,
                    recipients=[to_email],
                    body=body,
                    html=html_body,
                    sender=app.config.get("MAIL_DEFAULT_SENDER"),
                )
                mail.send(msg)
                return True
        except Exception as e:
            app.logger.warning("Failed to send password reset email: %s", e)
            if app.debug:
                print(f"[RESET] Reset link for {to_email}: {reset_url}")
                return True
            return False
    print(f"[RESET] To: {to_email} | Link: {reset_url}")
    return True

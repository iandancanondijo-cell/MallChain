# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately to maintain the security of our project.

### How to Report

Send an email to: security@mallchain.dev

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if known)

### What to Expect

- We will acknowledge receipt within 48 hours
- We will provide a detailed response within 7 days
- We will work with you to understand and resolve the issue
- We will notify you when the fix is deployed

## Security Best Practices

### For Developers

- Never commit secrets or API keys
- Use environment variables for sensitive configuration
- Validate all user inputs
- Use parameterized queries to prevent injection
- Keep dependencies updated
- Follow OWASP guidelines

### For Users

- Use strong, unique passwords
- Enable two-factor authentication when available
- Keep your software updated
- Report suspicious activity
- Never share your private keys or mnemonics

## Supported Versions

| Version | Supported Until |
|---------|----------------|
| 1.x     | Current        |

## Security Audits

This project undergoes regular security audits. Results are published in the SECURITY_AUDIT_REPORT.md file.

## Dependency Security

We use automated tools to scan for vulnerabilities:
- npm audit for Node.js dependencies
- go vet for Go code
- Dependabot for automated dependency updates

High and critical vulnerabilities are addressed immediately.

## Incident Response

In the event of a security incident:
1. Assess the impact and scope
2. Notify affected users
3. Deploy a fix
4. Conduct a post-incident review
5. Update documentation to prevent recurrence

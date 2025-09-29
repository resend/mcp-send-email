# Changelog

All notable changes to the MCP Send Email project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add more audience tools (create/get/delete)
- Add contact tools
- Add broadcast tools

### Changed

- Upgrade Resend SDK to v6.1.0
- Improve `list-audiences` response formatting

## [1.1.0] - 2025-07-08

### Added

- List audiences tool for Resend
- Removed React Email dependencies since it's not used in the project
- Updated Resend to latest version
- Add biome for formatting
- CC and BCC support for email recipients
- Full request/response logging for improved debugging
- New "Features" section in README documentation
- Usage examples for CC/BCC in email.md

### Fixed

- Sender email handling with Resend's API
- Type definitions for email request object

### Changed

- Improved instructions in README
- Removed test email address from example email.md
- Enhanced console logging for easier troubleshooting
- Updated documentation with Resend's email verification requirements

## [1.0.0] - 2025-02-24

### Added

- Initial release
- Basic email sending functionality
- HTML email support
- Email scheduling capability
- Reply-to addressing

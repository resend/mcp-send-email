import packageJson from '../package.json' with { type: 'json' };

process.env.RESEND_USER_AGENT = `resend-mcp:${packageJson.version}`;

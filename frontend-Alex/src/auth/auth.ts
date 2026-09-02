// frontend/src/auth/auth.ts

//const BASE = 'http://localhost:9000';
const BASE = '';

let accessToken: string | null = null;

export function setAccessToken(token: string | null):void
{
	accessToken = token;
}

export function getAccessToken(): string | null
{
	return accessToken;
}

export function isAuthenticated(): boolean
{
	return accessToken !== null;
}

export async function logout(): Promise<void>
{
	await fetch(`${BASE}/api/auth/logout/`, { method: 'POST' });
	accessToken = null;
}

export async function exchangeLoginToken(loginToken: string): Promise<void>
{
	const resp = await fetch(`${BASE}/api/auth/exchange/`, {
		method		: 'POST',
		headers		: { 'Content-Type': 'application/json' },
		body		: JSON.stringify({ login_token: loginToken }),
	})

	if (!resp.ok)
	{ throw new Error('Token exchange failed.'); }

	const data: { access: string } = await resp.json();
	if (!data.access)
	{ throw new Error('Token exchange response missing access token.'); }

	setAccessToken(data.access);
}

export async function verify2FA(tmpToken: string, code: string): Promise<void>
{
	const resp = await fetch(`${BASE}/api/auth/2fa/verify/`, {
		method		: 'POST',
		headers		: { 'Content-Type': 'application/json'},
		body		: JSON.stringify({ tmp_token: tmpToken, code}),
	});

	if (!resp.ok)
	{
		const errorData	= await resp.json().catch(() => ({}));
		const message	= errorData.error || '2FA verification failed.';
		throw new Error(message);
	}

	const data: { access:string } = await resp.json();
	if (!data.access)
		throw new Error('Verify response missing access token.');

	setAccessToken(data.access);
}

export async function enable2FA(): Promise<{ provisioning_uri: string, secret: string}>
{
	const resp = await fetch(`${BASE}/api/auth/2fa/enable/`, {
		method		: 'POST',
		headers		: { 'Authorization': `Bearer ${getAccessToken()}` },
	});

	if (!resp.ok)
	{
		const errorData = await resp.json().catch(() => ({}));
		throw new Error(errorData.error || 'Failed to enable 2FA.');
	}

	return resp.json();
}

export async function disable2FA(
	{ password, code }: { password?: string; code?: string}
): Promise<void>
{
	const body: Record<string, string> = {};

	if (password)	body.password	= password;
	if (code)		body.code		= code;

	const resp = await fetch(`${BASE}/api/auth/2fa/disable/`, {
		method		: 'POST',
		headers		: {
			'Content-Type'		: 'application/json',
			'Authorization'		: `Bearer ${getAccessToken()}`,
		},
		body		: JSON.stringify(body),
	});

	if (!resp.ok)
	{
		const errorData = await resp.json().catch(() => ({}));
		throw new Error(errorData.error || 'Failed to disable 2FA.');
	}
}

//export async function confirmEnable2FA(code: string): Promise<void>
//{
//	const resp = await fetch(`${BASE}/api/auth/2fa/confirm-enable/`, {
//		method		: 'POST',
//		headers		: {
//			'Content-Type'		: 'application/json',
//			'Authorization'		: `Bearer ${getAccessToken()}`,
//		},
//		body		: JSON.stringify({ code }),
//	});
//
//	if (!resp.ok)
//	{
//		const errorData = await resp.json().catch(() => ({}));
//		throw new Error(errorData.error || 'Failed to confirm 2FA.');
//	}
//}

export async function confirmEnable2FA(code: string): 
	Promise<{ status: string; recovery_codes?: string[] }>
{
	const resp = await fetch(`${BASE}/api/auth/2fa/confirm-enable/`, {
		method		: 'POST',
		headers		: {
			'Content-Type'		: 'application/json',
			'Authorization'		: `Bearer ${getAccessToken()}`,
		},
		body: JSON.stringify({ code }),
	});

	if (!resp.ok)
	{
		const errorData = await resp.json().catch(() => ({}));
		throw new Error(errorData.error || 'Failed to confirm 2FA.');
	}

	return resp.json();
}

async function refreshAccessToken(): Promise<string>
{
	const resp = await fetch(`${BASE}/api/auth/refresh/`,
	{
		method	: 'POST',
		headers	: { 'X-Requested-With': 'XMLHttpRequest' },
	});

	if (!resp.ok)
	{
		accessToken = null;
		throw new Error('Refresh failed.');
	}

	const data: { access: string } = await resp.json();

	accessToken = data.access;

	return accessToken;
}

interface ApiFetchOptions extends RequestInit
{
	// no extra fields needed; headers already in RequestInit
}

export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response>
{
	const headers = new Headers(options.headers || {});

	if (accessToken)
	{ headers.set('Authorization', `Bearer ${accessToken}`); }

	let resp = await fetch(url, { ...options, headers });

	if (resp.status == 401 && accessToken)
	{
		try
		{
			await refreshAccessToken();
			headers.set('Authorization', `Bearer ${accessToken}`);
			resp = await fetch(url, { ...options, headers });
		}
		catch
		{ 
			// refresh failed - let original 401 propagate 
		}
	}

	return resp;
}

export function loginWithProvider(providerName: string): void
{
	window.location.href = `${BASE}/api/auth/${providerName}/login/`;
}

export async function loginWithPassword(username: string, password: string): Promise<void>
{
	const resp = await fetch(`${BASE}/api/login/`,{
		method		: 'POST',
		headers		: { 'Content-Type': 'application/json'},
		body		: JSON.stringify({ username, password }),
	});
	
	if (!resp.ok)
	{ throw new Error('Login failed.') }

	const data = await resp.json();
	if (!data.access)
	{ throw new Error('Login response missing access token') }

	setAccessToken(data.access);
}

export async function register(username: string, email: string, password: string): Promise<{ id: number; username: string }>
{
	const resp = await fetch(`${BASE}/api/register/`, {
		method		: 'POST',
		headers		: { 'Content-Type': 'application/json' },
		body		: JSON.stringify({ username, email, password }),
	});

	if (!resp.ok)
	{
		const errorData	= await resp.json().catch(() => ({}));
		// DRF returns an object with field names as keys; extract a flat message
		const message	= typeof errorData === 'object' 
			? Object.values(errorData).flat().join(' ') || 'Registration failed.'
			: 'Registration failed.';
		throw new Error(message);
	}

	return resp.json();		// { id, username }
}

export async function linkAccount(linkToken: string): Promise<void>
{
	const resp = await fetch(`${BASE}/api/auth/link/`, {
		method		: 'POST',
		headers		: {
			'Content-Type'		: 'application/json',
			'Authorization'		: `Bearer ${getAccessToken()}`,
			'X-Requested-With'	: 'XMLHttpRequest',
		},
		body		: JSON.stringify({ link_token: linkToken}),
	});

	if (!resp.ok)
	{ throw new Error('Account linking failed.'); }
}

/**
 * Resolve an OAuth username conflict by submitting a chosen username.
 *
 * @param newUsername - The username picked by the user.
 * @param conflictToken - The token received from the callback redirect.
 * @returns The access token string on success.
 * @throws If the username is taken, the token is invalid, or the server returns an error.
 */
export async function resolveUsernameConflict(
	newUsername		: string,
	conflictToken	: string,
): Promise<string> {
	const resp = await fetch(`${BASE}/api/auth/resolve-username/`, {
		method		: 'POST',
		headers		: { 'Content-Type': 'application/json' },
		body		: JSON.stringify({ username: newUsername, token: conflictToken })
	});

	if	(!resp.ok)
	{
		const errorData	= await resp.json().catch(() => ({}));
		const message	= errorData.error || 'Username conflict resolution failed.';
		throw new Error(message);
	}

	const data: { login_token: string } = await resp.json();
	if	(!data.login_token)
		throw new Error('Resolution response missing login token.');

	// Immediately exchange the login_token for a JWT access token.
	await exchangeLoginToken(data.login_token);

	// Guaranteed to be set after successful exchange.
	return getAccessToken()!;
}


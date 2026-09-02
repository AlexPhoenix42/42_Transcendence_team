
// frontend/src/auth/UsernameConflictHandler.tsx

import { useState }							from 'react';
import { useSearchParams, useNavigate }		from 'react-router-dom';
import { resolveUsernameConflict }			from './auth'

export default function UsernameConflictHandler()
{
	const [searchParams]				= useSearchParams();
	const navigate						= useNavigate();
	const [newUsername, setNewUsername]	= useState('');
	const [error, setError]				= useState('');

	const status			= searchParams.get('status');
	const conflictToken		= searchParams.get('token');
	const currentUsername	= searchParams.get('username');

	// Only render when we actually have a username conflict
	if	(status !== 'username_conflict' || !conflictToken)
		return null;

	const handleSubmit = async (e: React.FormEvent) =>
	{
		e.preventDefault();
		setError('');
		try
		{
			await resolveUsernameConflict(newUsername, conflictToken);
			// Success, clear the query params and go to the main page.
			navigate('/', { replace: true});
		}
		catch (err: any)
			setError(err.message);
	};

	return (
		<section>
			<h2>Username Conflict</h2>
			<p>
				The username “{currentUsername}” is already taken.
				Please choose another one.
			</p>
			<form onSubmit={handleSubmit}>
				<input
					type="text"
					placeholder="New username"
					value={newUsername}
					onChange={e => setNewUsername(e.target.value)}
					required
				/>
				<button type="submit">Continue</button>
			</form>
			{ error && <p style={{ color: 'red' }}>{error}</p> }
        </section>
	);
}


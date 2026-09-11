//frontend-react/src/components/Footer.tsx

import { Link } from "react-router-dom"

export default function Footer() {
	const year = new Date().getFullYear()

	return (
		<footer className="bg-gray-800 py-6 text-center">
			<div className="flex justify-center gap-6 mb-3">
				<Link to="/privacy-policy" className="text-gray-300 hover:text-white">Privacy Policy</Link>
				<Link to="/terms-of-service" className="text-gray-300 hover:text-white">Terms of Service</Link>
			</div>
			<p className="text-gray-400 text=sm">
				© {year} All rights reserved.
			</p>
		</footer>
	)
}

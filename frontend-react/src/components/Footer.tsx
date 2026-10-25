//frontend-react/src/components/Footer.tsx

import { Link } from "react-router-dom"
import { useI18n } from "../i18n/I18nProvider.tsx"

interface FooterProps {
		openInNewTab?: boolean
}

export default function Footer({ openInNewTab = false }: FooterProps) {
	const year = new Date().getFullYear()
	const { t, n } = useI18n()

	return (
		<footer className="bg-gray-800 py-3 text-center">
			<div className="flex justify-center gap-6 mb-3">
				<Link to="/privacy-policy"
						className="text-gray-300 hover:text-white"
						target={openInNewTab ? "_blank" : undefined}
						rel={openInNewTab ? "noopener noreferrer" : undefined}>
						{t("footer.privacy")}</Link>
				<Link to="/terms-of-service"
						className="text-gray-300 hover:text-white"
						target={openInNewTab ? "_blank" : undefined}
						rel={openInNewTab ? "noopener noreferrer" : undefined}>
						{t("footer.terms")}</Link>
			</div>
			<p className="text-gray-400 text-sm">
				{t("footer.copyright", { year: n(year, { useGrouping: false }) })}
			</p>
		</footer>
	)
}

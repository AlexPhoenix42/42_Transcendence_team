//frontend-react/src/pages/TermsOfService.tsx

import { useT } from "../i18n/I18nProvider.tsx"

export default function TermsOfService() {
	const t = useT()

    return (
		<div className="min-h-screen bg-gray-900 text-gray-300">
			<div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
				<h1 className="text-3xl font-bold text-white mb-6">{t("terms.title")}</h1>
				<p><i>{t("terms.updated")}</i></p>
				<p>{t("terms.intro")}</p>
				<p><b>{t("terms.contents.title")}</b></p>
					<ol className="indent-8 list-decimal list-inside space-y-1 underline">
						<li><a href="#Art1">{t("terms.contents.art1")}</a></li>
						<li><a href="#Art2">{t("terms.contents.art2")}</a></li>
						<li><a href="#Art3">{t("terms.contents.art3")}</a></li>
						<li><a href="#Art4">{t("terms.contents.art4")}</a></li>
					</ol>
				<br></br>

				<section>
					<h2 id="Art1" className="text-xl font-semibold text-white mb-2">
						{t("terms.art1.heading")}
					</h2>
					<p>{t("terms.art1.body")}</p>
					<br></br>
				</section>

				<section>
					<h2 id="Art2" className="text-xl font-semibold text-white mb-2">
						{t("terms.art2.heading")}
					</h2>
					<p>{t("terms.art2.body")}</p>
					<br></br>
				</section>

				<section>
					<h2 id="Art3" className="text-xl font-semibold text-white mb-2">
						{t("terms.art3.heading")}
					</h2>
					<p>{t("terms.art3.body")}</p>
					<br></br>
				</section>

				<section>
					<h2 id="Art4" className="text-xl font-semibold text-white mb-2">
						{t("terms.art4.heading")}
					</h2>
					<p>{t("terms.art4.body1")}</p>
					<br></br>
					<p>{t("terms.art4.body2")}</p>
					<br></br>
				</section>

			</div>
		</div>
	)
}

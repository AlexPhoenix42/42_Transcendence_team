//frontend-react/src/pages/PrivacyPolicy.tsx

import { useT } from "../i18n/I18nProvider.tsx"

export default function PrivacyPolicy() {
		const t = useT()

		return (
			<div className="min-h-screen bg-gray-900 text-gray-300">
				<div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
					<h1 className="text-3xl font-bold text-white mb-6">{t("privacy.title")}</h1>
						<p><i>{t("privacy.updated")}</i></p>
						<p>{t("privacy.intro1")}</p>
						<p>{t("privacy.intro2")}</p>
						<p><b>{t("privacy.toc.title")}</b></p>
							<ol className="indent-8 list-decimal list-inside space-y-1 underline">
								<li><a href="#1">{t("privacy.toc.1")}</a></li>
								<li><a href="#2">{t("privacy.toc.2")}</a></li>
								<li><a href="#3">{t("privacy.toc.3")}</a></li>
								<li><a href="#4">{t("privacy.toc.4")}</a></li>
								<li><a href="#5">{t("privacy.toc.5")}</a></li>
								<li><a href="#6">{t("privacy.toc.6")}</a></li>
								<li><a href="#7">{t("privacy.toc.7")}</a></li>
								<li><a href="#8">{t("privacy.toc.8")}</a></li>
							</ol>
						<section>
							<h2	id="1" className="text-xl font-semibold text-white mb-2">
								{t("privacy.s1.heading")}
							</h2>
							<p>{t("privacy.s1.body")}</p>
						</section>

						<section>
							<h2	id="2" className="text-xl font-semibold text-white mb-2">
								{t("privacy.s2.heading")}
							</h2>
							<p>{t("privacy.s2.intro")}</p>
							<ul className="indent-8 list-disc list-inside space-y-1">
								<li>{t("privacy.s2.item.name")}</li>
								<li>{t("privacy.s2.item.nickname")}</li>
								<li>{t("privacy.s2.item.email")}</li>
								<li>{t("privacy.s2.item.phone")}</li>
								<li>{t("privacy.s2.item.password")}</li>
								<li>{t("privacy.s2.item.chatlogs")}</li>
								<li>{t("privacy.s2.item.media")}</li>
							</ul>
							<br></br>
							<p>
								<b>{t("privacy.s2.note")}</b>
							</p>
							<br></br>
							<p>{t("privacy.s2.perfIntro")}</p>
							<ul className="indent-8 list-disc list-inside space-y-1">
								<li>{t("privacy.s2.item.browser")}</li>
								<li>{t("privacy.s2.item.ip")}</li>
								<li>{t("privacy.s2.item.device")}</li>
							</ul>
							</section>

							<section>
							<h2	id="3" className="text-xl font-semibold text-white mb-2">
								{t("privacy.s3.heading")}
							</h2>
							<p>{t("privacy.s3.body1")}</p>
							<p>{t("privacy.s3.body2")}</p>
							</section>

							<section>
							<h2 id="4" className="text-xl font-semibold text-white mb-2">
								{t("privacy.s4.heading")}
							</h2>
							<p>{t("privacy.s4.body")}</p>
							</section>

							<section>
								<h2 id="5" className="text-xl font-semibold text-white mb-2">
									{t("privacy.s5.heading")}
								</h2>

								<p>{t("privacy.s5.body")}</p>
								</section>

								<section>
									<h2 id="6" className="text-xl font-semibold text-white mb-2">
										{t("privacy.s6.heading")}
									</h2>

									<p>{t("privacy.s6.body")}</p>
								</section>

								<section>
									<h2	id="7" className="text-xl font-semibold text-white mb-2">
										{t("privacy.s7.heading")}
									</h2>

									<p>{t("privacy.s7.body")}</p>
								</section>

								<section>
									<h2 id="8" className="text-xl font-semibold text-white mb-2">
										{t("privacy.s8.heading")}
									</h2>

									<p>{t("privacy.s8.body")}</p>
								</section>

							</div>
					</div>
		)
}

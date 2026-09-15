//frontend-react/src/pages/TermsOfService.tsx

export default function TermsOfService() {
    return (
		<div className="min-h-screen bg-gray-900 text-gray-300">
			<div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
				<h1 className="text-3xl font-bold text-white mb-6">Terms of Service</h1>
				<p><i>Updated as of 09 September 2026</i></p>
				<p>
					The General Terms of Service, hereafter referred to as GTS, apply to the use of
					[Project Name] hereafter referred to as the Service. GTS applies to any user who
					uses the Service for any purpose. The GTS can be amended or updated at any time,
					and if the user wishes to no longer comply, they must stop using the service. For
					all enquires relating to the use of the Service, you may contact the Data Protection
					Officers as outlined in the Privacy Policy.
				</p>
				<p><b>Contents:</b></p>
					<ol className="indent-8 list-decimal list-inside space-y-1 underline">
						<li><a href="#Art1">Acceptance of the General Terms of Use</a></li>
						<li><a href="#Art2">Definition of Acceptable Use</a></li>
						<li><a href="#Art3">Intellectual Property</a></li>
						<li><a href="#Art4">Limitation of Liability</a></li>
					</ol>
				<br></br>

				<section>
					<h2 id="Art1" className="text-xl font-semibold text-white mb-2">
						Article 1: Acceptance of the General Terms of Use
					</h2>
					<p>
						By using the Service, you consent to the GTS. Any violation of the Terms of
						Service as outlined in this document will result in the immediate forfeiture
						and termination of your account and ability to use the Service in the future.
					</p>
					<br></br>
				</section>
				
				<section>
					<h2 id="Art2" className="text-xl font-semibold text-white mb-2">
						Article 2: Definition of Acceptable Use
					</h2>
					<p>
						You agree to use the Service for its intended purpose, which is for
						entertainment and education. You agree to maintain a civil discussion
						in global chats, chats with friends and chats with the AI chess coach,
						and refrain from any use of language or actions which may be considered
						derogatory, defamatory or discriminatory. You agree to not abuse the use
						of the Chess AI coach, or use it for any other purposes other than to 
						discuss chess in an educational scope. Any attempts to use the service
						for purposes other than entertainment or education, will result in the
						violation of this contract, and you will forfeit your right to the Service.
					</p>
					<br></br>
				</section>
			
				<section>
					<h2 id="Art3" className="text-xl font-semibold text-white mb-2">
						Article 3: Intellectual Property
					</h2>
					<p>
						The name, logos, media, and the Service itself are the intellectual property
						of the authors of this Service, hereafter referred to as the “Providers of
						the Service”. Any use, replication, modification or dissemination of this
						Service without the prior written consent of all Providers of the Service
						is considered an act of counterfeit under the Intellectual Property Code,
						and will be pursued.
					</p>
					<br></br>
				</section>

				<section>
					<h2 id="Art4" className="text-xl font-semibold text-white mb-2">
						Article 4: Limitation of Liability
					</h2>
					<p>
						The Providers of the Service shall not be held liable for omissions,
						inaccuracies, deficiencies and breaches in the provision of their Service,
						so long as it is an error originating from a third-party service out of their
						control. The User remains accountable for their use of the Service, when it is
						not used for its intended purposes. Any pursuance of justice relating to the
						Service, Providers of the Service, or the User, shall be subjected to Belgian
						Law.
					</p>
					<p>
						The Providers of the Service reserve the right to modify any part of the
						Service at any time, for any reasons.
					</p>
					<br></br>
				</section>

			</div>
		</div>
	)
}


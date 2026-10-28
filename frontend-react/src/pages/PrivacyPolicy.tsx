//frontend-react/src/pages/PrivacyPolicy.tsx
// i18n-exempt-file: legal text — requires legal review to translate

export default function PrivacyPolicy() {
		return (
			<div className="min-h-screen bg-gray-900 text-gray-300">
				<div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
					<h1 className="text-3xl font-bold text-white mb-6">Privacy Policy</h1>
						<p><i>Updated as of 09 September 2026</i></p>
						<p>
							This Privacy Policy explains the policies of [Project Name]
							on the collection, use, disclosure and protection of personal data we collect
							when you access [Project Name], hereafter referred to as the “Service”.
							This Privacy Policy defines and describes your privacy rights and how you are
							protected under applicable privacy laws.
						</p>
						<p>
							By using our Service, you are consenting to the collection and use of your personal
							data in accordance with this Privacy Policy. Please do not access or use our Service
							if you do not consent to the collection and use of your information as outlined in
							this Privacy Policy.
						</p>
						<p><b>In this Policy:</b></p>
							<ol className="indent-8 list-decimal list-inside space-y-1 underline">
								<li><a href="#1">Who is responsible for processing personal data?</a></li>
								<li><a href="#2">What personal data is collected?</a></li>
								<li><a href="#3">Why is my personal data collected?</a></li>
								<li><a href="#4">How can I manage my cookie preferences?</a></li>
								<li><a href="#5">How long will my personal data be kept?</a></li>
								<li><a href="#6">Where is my data stored?</a></li>
								<li><a href="#7">Who has access to my personal data? Will my personal data be shared?</a></li>
								<li><a href="#8">Changes to this Privacy Policy</a></li>
							</ol>
						<section>
							<h2	id="1" className="text-xl font-semibold text-white mb-2">
								1. Who is responsible for processing personal data?
							</h2>
							<p>
								In the context of personal data collected by the Service, the authors, hereafter
								referred to as the “Providers of the Service” are responsible for processing
								personal data. For any further enquiries or issues relating to the treatment
								of personal data which are not outlined in this Privacy Policy, you may refer
								to any Provider of the Service as a Data Protection Officer.
								You may contact them through official channels of 42 on Slack, their identifiers
								are in the README.md of this Service.
							</p>
						</section>

						<section>
							<h2	id="2" className="text-xl font-semibold text-white mb-2">
								2. What personal data is collected?
							</h2>
							<p>
								The Providers of the Service, collect basic personal data in the form of:
							</p>
							<ul className="indent-8 list-disc list-inside space-y-1">
								<li>Name</li>
								<li>Nickname</li>
								<li>Email</li>
								<li>Phone Number</li>
								<li>Password</li>
								<li>Chat Logs</li>
								<li>Any other uploaded media by the User</li>
							</ul>
							<br></br>
							<p>
								<b>Note:</b> If a you, (the User) uses a third-party authentication process through
								OAuth, this data will not be collected or stored in any form by the Providers.
							</p>
							<br></br>
							<p>
								In order to improve the performance of our Service, we may occasionally
								collect data such as:
							</p>
							<ul className="indent-8 list-disc list-inside space-y-1">
								<li>Browser</li>
								<li>IP address</li>
								<li>Device</li>
							</ul>
							</section>

							<section>
							<h2	id="3" className="text-xl font-semibold text-white mb-2">
								3. Why is my personal data collected?
							</h2>
							<p>
								Personal data, where it is necessary for the sign up and creation of a User
								account, or where it is necessary to improve the performance of our Service,
								is collected under the GDPR legal basis of “Performance of a Contract”,
								as without, the use of the Service would not be possible by the User.
								Any personal information beyond that strictly necessary to provide the
								Service (such as a Nickname and Chat Logs) is collected via the GDPR legal
								basis of “Consent”.
							</p>
							<p>
								The User is only obliged to provide the necessary personal data for the sign
								up and creation of an account, if the User wishes to use the Service.
							</p>
							</section>

							<section>
							<h2 id="4" className="text-xl font-semibold text-white mb-2">
								4. How can I manage my cookie preferences?
							</h2>
							<p>
								No cookies are used, collected or stored by the Service at any point.
							</p>
							</section>

							<section>
								<h2 id="5" className="text-xl font-semibold text-white mb-2">
									5. How long will my personal data be kept?
								</h2>

								<p>
									Your personal data will be kept indefinitely by the Service, so long as a User
									has a registered account. It is necessary in order to provide the Service to
									the User, that personal data must be kept, to provide the User with the best
									experience.
								</p>
								</section>

								<section>
									<h2 id="6" className="text-xl font-semibold text-white mb-2">
										6. Where is my data stored?
									</h2>

									<p>
										Personal data is stored in databases on our local server, within Belgium, in the EU.
										We guarantee that personal data is never transferred out of the EU, or to a
										third-party service. Passwords are always stored in encrypted form.
									</p>
								</section>

								<section>
									<h2	id="7" className="text-xl font-semibold text-white mb-2">																			7. Who has access to my personal data? Will my personal data be shared?
									</h2>

									<p>
										Only the Providers of the Service have access to the personal data of the User.
										Your personal data will not be shared with any third parties, unless you decide
										to create an account via Authorisation of a third party (through OAuth).
									</p>
								</section>

								<section>
									<h2 id="8" className="text-xl font-semibold text-white mb-2">
										8. Changes to this Privacy Policy
									</h2>

									<p>
										This Privacy Policy may undergo changes at any time. If the User wishes to remove
										their consent towards the collection of their personal data, they will forfeit
										their right to an account, and to use the Service. To raise this issue, a User
										must contact a Data Protection Officer, under the section “Who is responsible for
										processing personal data?” of this Privacy Policy.
									</p>
								</section>

							</div>
					</div>
		)
}

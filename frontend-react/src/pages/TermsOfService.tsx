//frontend-react/src/pages/TermsOfService.tsx

export default function TermsOfService() {
    return (
        <div className="min-h-screen bg-gray-900 text-gray-100">
            <div className="max-w-4xl mx-auto px-6 py-12">
                <h1 className="text-3xl font-bold mb-6">
                    Terms of Service
                </h1>

                <div className="space-y-6 text-gray-300">
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">
                            1. Acceptance of Terms
                        </h2>
                        <p>
                            By using this application, you agree to these
                            Terms of Service. If you do not agree with these
                            terms, please do not use the application.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">
                            2. Use of the Service
                        </h2>
                        <p>
                            You agree to use the application responsibly and
                            in accordance with these terms and all applicable
                            laws and regulations.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">
                            3. User Accounts
                        </h2>
                        <p>
                            You are responsible for maintaining the security of
                            your account and for all activity carried out
                            through your account.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-white mb-2">
                            4. Changes to These Terms
                        </h2>
                        <p>
                            We reserve the right to update these Terms of
                            Service when necessary. Continued use of the
                            application after changes are made constitutes
                            acceptance of the updated terms.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}


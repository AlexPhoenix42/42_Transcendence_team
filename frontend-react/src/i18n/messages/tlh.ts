// frontend-react/src/i18n/messages/tlh.ts
//
// Klingon -- tlhIngan Hol. ISO 639-3: tlh.
//
// -- Read this before trusting it -----------------------------------------
//
// A PARTIAL translation, deliberately. config.ts marks it `complete: false`,
// so scripts_dev/check_i18n.py reports its coverage rather than failing the
// build over the keys it omits.
//
// Vocabulary comes from Marc Okrand's *The Klingon Dictionary* where a real
// word exists. Where one does not -- Klingon has roughly 3,000 words and no
// native term for OAuth, two-factor authentication or a tournament bracket --
// the key is LEFT OUT rather than invented. Omitted keys fall back to English
// through the provider's normal chain, so the UI stays coherent instead of
// becoming half-plausible nonsense.
//
// Entries marked COINAGE are descriptive constructions, not attested words.
// They follow Klingon grammar (verb + -wI' for "one who does", noun-noun
// compounds, -mey / -pu' plurals) but a speaker would not recognise them as
// standard. Flagged so nobody mistakes them for canon.
//
// Capitalisation is SIGNIFICANT in Klingon orthography: q and Q are different
// consonants, as are D/d and S/s. "Qapla'" is not "qapla'". Do not let a
// formatter or a helpful editor normalise the casing.

import type { MessageTable } from "./en.ts"

export const tlh: MessageTable = {
    // -- Navbar ----------------------------------------------------------
    "nav.games":        "Qujmey",           // games  (Quj = game, -mey = plural)
    "nav.tournaments":  "qaywI'mey",        // COINAGE: contests
    "nav.leaderboard":  "charghwI'pu'",     // conquerors  (-pu' = plural, beings)
    "nav.friends":      "juppu'",           // friends
    "nav.chat":         "ja'chuq",          // to confer with one another
    "nav.profile":      "De'wI'",           // COINAGE: data record
    "nav.admin":        "la'",              // commander
    "nav.editProfile":  "De' choH",         // change data
    "nav.logout":       "mej",              // to depart
    "nav.greeting":     "nuqneH {name}",    // the standard Klingon greeting

    // -- Language switcher -----------------------------------------------
    "lang.label":       "Hol",              // language

    // -- Shared actions --------------------------------------------------
    "common.loading":    "loS...",          // to wait
    "common.submit":     "ngeH",            // to send
    "common.submitting": "ngeHtaH...",      // is sending  (-taH = continuous)
    "common.send":       "ngeH",
    "common.or":         "pagh",            // or / none
    "common.back":       "chegh",           // to return
    "common.save":       "pol",             // to keep, to store
    "common.cancel":     "qIl",             // to cancel
    "common.confirm":    "HIja'",           // yes
    "common.accept":     "laj",             // to accept
    "common.decline":    "lajQo'",          // to refuse  (-Qo' = refusal suffix)
    "common.remove":     "teq",             // to remove
    "common.bio":        "qun",             // history

    // -- Stats -- Klingon is richly supplied with words for winning and losing
    "stats.wins":       "yay",              // victory
    "stats.losses":     "luj",              // to fail, to lose
    "stats.draws":      "rIn",              // to be finished
    "stats.games":      "Qujmey",
    "stats.rating":     "patlh",            // rank, status

    "role.admin":       "la'",              // commander
    "role.mod":         "yaS",              // officer

    // -- Games -----------------------------------------------------------
    "games.title":        "Qujmey",
    "games.chess.title":  "may' Quj",       // COINAGE: battle game
    "games.coach.title":  "ghojmoHwI'",     // teacher  (ghojmoH = to teach)
    "games.goose.title":  "bo' Quj",        // COINAGE: goose game
    "games.pacman.title": "Pacman",
    "games.pacman.body":  "SIbI' qaS",      // it happens soon

    // -- Chess -----------------------------------------------------------
    "chess.resign":      "jegh",            // to surrender
    "chess.yourTurn":    "SoH",             // you
    "chess.gameOver":    "rIn Quj",         // the game is finished
    "chess.backToLobby": "chegh",           // to return
    "chess.send":        "ngeH",
    "chess.spectating":  "bej",             // to watch

    "piece.queen":       "ta'be'",          // COINAGE: emperor-female
    "piece.rook":        "'och",            // COINAGE in this sense: conduit/tower
    "piece.knight":      "Duj",             // vessel, ship
    "piece.bishop":      "Sogh",            // lieutenant

    "reason.checkmate":  "Qapla'",          // SUCCESS — the famous one
    "reason.resignation":"jegh",            // surrender
    "reason.timeout":    "poH rIn",         // the time is finished
    "reason.draw":       "rIn",

    "history.result.win":  "yay",
    "history.result.loss": "luj",
    "history.result.draw": "rIn",

    // -- Friends / chat --------------------------------------------------
    "friends.title":     "juppu'",
    "chat.global":       "Hoch ja'chuq",    // everyone-confer
    "chat.noMessages":   "QIn tu'lu'be'",   // no message is found
    "chat.placeholder":  "QIn ghItlh...",   // write a message

    // -- Login / register ------------------------------------------------
    "login.submit":      "'el",             // to enter
    "login.submitting":  "'eltaH...",       // is entering
    "field.username":    "pong",            // name
    "field.password":    "pegh mu'",        // secret word
    "field.email":       "QIn Daq",         // COINAGE: message location
    "register.submit":   "chenmoH",         // to create
    "register.title":    "De'wI' chu'",     // new record

    // -- Errors -- Qagh is "mistake", luj is "to fail" --------------------
    "login.error.failed":        "luj",
    "common.error.network":      "Qagh",
    "common.error.networkShort": "Qagh",
    "common.error.generic":      "Qagh",
    "srv.userNotFound":          "nuv tu'lu'be'",   // the person is not found
    "srv.gameFull":              "Quj buy'",        // the game is full
    "srv.authRequired":          "'el 'e' poQlu'",  // entry is required

    // -- Status ----------------------------------------------------------
    "status.title":      "patlh",            // status
    "status.ok":         "Qapla'",           // success
    "status.outage":     "Qagh",             // failure

    // -- Dashboard cards -------------------------------------------------
    // Bodies are kept as short imperative or noun phrases rather than full
    // sentences. Klingon is OVS with an elaborate prefix system, and a
    // mangled long sentence is worse than an accurate short one.
    // Imperative prefixes: yI- (singular object), tI- (plural object).
    "dash.games.title":        "Qujmey",                    // games
    "dash.games.body":         "may' Quj Pacman joq",       // battle-game or Pacman
    "dash.tournaments.title":  "qaywI'mey",                 // COINAGE: contests
    "dash.tournaments.body":   "qaywI' yIchenmoH",          // create a contest!
    "dash.friends.title":      "juppu'",                    // friends
    "dash.friends.body":       "juppu'lIj tIQorgh",         // tend to your friends!
    "dash.chat.title":         "ja'chuq",                   // confer together
    "dash.chat.body":          "latlh QujwI'pu' tIja'",     // tell other players!

    // -- Other page titles the user actually lands on --------------------
    "games.chess.body":        "may' Quj",                  // battle game
    "games.coach.body":        "ghojmoHwI' yItlhob",        // ask the teacher!
    "games.goose.body":        "cha' - jav QujwI'pu'",      // 2-6 players
    "leaderboard.title":       "charghwI'pu'",              // conquerors
    "leaderboard.rank":        "patlh",                     // rank
    "leaderboard.player":      "QujwI'",                    // one who plays
    "leaderboard.empty":       "QujwI'pu' tu'lu'be'",       // no players are found
    "profile.title":           "De'wI'",                    // COINAGE: data record
    "profile.edit":            "De' choH",                  // change data
    "tournaments.title":       "qaywI'mey",
    "tournaments.join":        "'el",                       // to enter
    "tournaments.leave":       "mej",                       // to depart
    "tournaments.view":        "bej",                       // to watch
    "tournaments.empty":       "qaywI'mey tu'lu'be'",       // no contests are found
    "history.title":           "may'mey qun",               // history of battles
    "history.empty":           "may'mey tu'lu'be'",         // no battles are found
    "chessLobby.title":        "may' pa'",                  // battle room
    "chessLobby.vsHuman":      "Human",                     // (no Klingon word; kept)
    "chessLobby.vsAI":         "jIH De'wI'",                // COINAGE: the machine
    "chessLobby.easy":         "ngeD",                      // to be easy
    "chessLobby.medium":       "motlh",                     // to be usual
    "chessLobby.hard":         "Qatlh",                     // to be difficult
    "analytics.title":         "De'",                       // data
    "achievements.title":      "Qapla'mey",                 // successes

    // -- Dashboard -------------------------------------------------------
    "dash.welcome":      "nuqneH {name}",

    // -- Common ----------------------------------------------------
    "common.backToLogin":            "chegh",             // return
    "common.goToLogin":              "'el",               // enter
    "common.error.passwordMismatch": "pegh mu' rapbe'",   // the secret words are not the same
    "common.players_one":            "QujwI' wa'",        // one player
    "common.players_other":          "{count} QujwI'pu'", // players
    "common.minutes_one":            "tup wa'",           // one minute
    "common.minutes_other":          "{count} tup",       // minutes

    // -- Analytics -- Klingon has clean words for colour and enemy --
    "analytics.white":         "chIS",                    // to be white
    "analytics.black":         "qIj",                     // to be black
    "analytics.totalGames":    "Hoch Qujmey",             // all games
    "analytics.byColor":       "chIS qIj je",             // white and black
    "analytics.byOpponent":    "jaghpu'",                 // enemies
    "analytics.mostPlayed":    "jaghpu' law'",            // many enemies
    "analytics.thisWeek":      "Hoghvam",                 // this week
    "analytics.thisMonth":     "jarvam",                  // this month
    "analytics.stats":         "De'",                     // data
    "analytics.noGames":       "Qujmey tu'lu'be'",        // no games are found
    "analytics.backToProfile": "chegh",                   // return
    "analytics.avgLength":     "poH motlh",               // usual time
    "analytics.streak.win":    "yay",                     // victory
    "analytics.streak.loss":   "luj",                     // failure
    "analytics.streak.draw":   "rIn",                     // finished

    // -- Bracket -- rounds named by player count, which is how they work 
    "bracket.final":         "Qav",                       // to be final
    "bracket.semiFinals":    "loS QujwI'pu'",             // four players
    "bracket.quarterFinals": "chorgh QujwI'pu'",          // eight players
    "bracket.round":         "may' {n}",                  // battle {n}
    "bracket.done":          "rIn",                       // finished
    "bracket.live":          "qaStaH",                    // is occurring
    "bracket.pending":       "loS",                       // to wait
    "bracket.start":         "tagh",                      // to begin
    "bracket.play":          "Quj",                       // to play
    "bracket.watch":         "bej",                       // to watch
    "bracket.view":          "legh",                      // to see
    "bracket.tbd":           "Sovbe'lu'",                 // it is not known

    // -- Chess lobby -----------------------------------------------
    "chessLobby.newGame":     "Quj chu'",                 // new game
    "chessLobby.close":       "SoQmoH",                   // to close
    "chessLobby.timeControl": "poH",                      // time period
    "chessLobby.unlimited":   "Hoch poH",                 // all time
    "chessLobby.difficulty":  "Qatlh",                    // to be difficult
    "chessLobby.createGame":  "Quj yIchenmoH",            // create a game!
    "chessLobby.activeGames": "Qujmey qaStaH",            // games occurring
    "chessLobby.openGames":   "Qujmey loS",               // waiting games
    "chessLobby.liveGames":   "Qujmey qaStaH",            // games occurring
    "chessLobby.noOpenGames": "Qujmey tu'lu'be'",         // no games are found
    "chessLobby.noLiveGames": "Qujmey tu'lu'be'",         // no games are found
    "chessLobby.resume":      "taH",                      // to continue
    "chessLobby.join":        "'el",                      // to enter
    "chessLobby.watch":       "bej",                      // to watch

    // -- Chess -----------------------------------------------------
    "chess.undo":           "qIl",                        // to cancel
    "chess.promoteTo":      "yIwIv",                      // choose!
    "chess.gameChat":       "ja'chuq",                    // confer together
    "chess.set":            "cher",                       // to establish
    "chess.error.notFound": "tu'lu'be'",                  // it is not found
    "history.moves_one":    "vIH wa'",                    // one move
    "history.moves_other":  "{count} vIH",                // moves

    // -- Friends ---------------------------------------------------
    "friends.empty":          "juppu' tu'lu'be'",         // no friends are found
    "friends.noRequests":     "tlhobmey tu'lu'be'",       // no requests are found
    "friends.noSent":         "tlhobmey tu'lu'be'",       // no requests are found
    "friends.tab.friends":    "juppu' ({count})",         // friends
    "friends.tab.requests":   "tlhobmey ({count})",       // requests
    "friends.tab.sent":       "ngeHta' ({count})",        // sent
	"friends.tab.blocked": "bot ({count})",
	"friends.noBlocked": "bot pagh.",
	"friends.unblocked": "{user} botHa'.",
    "friends.addPlaceholder": "pong yIghItlh",            // write a name!

    // -- Goose -- Klingon has solid words for death and prison ------
    "goose.title":             "bo'Degh Quj",             // bird game
    "goose.players":           "QujwI'pu'",               // players
    "goose.startGame":         "yItagh",                  // begin!
    "goose.rollDice":          "🎲 yIwoD",                 // throw!
    "goose.rolling":           "woDtaH...",               // is throwing
    "goose.gameLog":           "qun",                     // history
    "goose.noMoves":           "vIHmey tu'lu'be'",        // no moves are found
    "goose.legend":            "De'",                     // data
    "goose.backToLobby":       "chegh",                   // return
    "goose.waitingForPlayers": "QujwI'pu' loStaH",        // waiting for players
    "goose.waitingForHost":    "la' loStaH",              // waiting for the commander
    "goose.showRules":         "chutmey",                 // laws
    "goose.hideRules":         "chutmey So'",             // hide the laws
    "square.goose":            "bo'Degh",                 // bird
    "square.death":            "Hegh",                    // death
    "square.prison":           "bIghHa'",                 // prison
    "square.inn":              "Qe'",                     // restaurant
    "square.finish":           "rIn",                     // to be finished
    "square.well":             "bIQ 'och",                // water conduit
    "square.maze":             "mIS Daq",                 // confusion place
    "square.bridge":           "'och",                    // conduit
    "gooseLobby.title":        "bo'Degh Quj",             // bird game
    "gooseLobby.players":      "QujwI'pu'",               // players
    "gooseLobby.create":       "chenmoH",                 // to create
    "gooseLobby.join":         "'el",                     // to enter
    "gooseLobby.watch":        "bej",                     // to watch
    "gooseLobby.play":         "Quj",                     // to play
    "gooseLobby.waiting":      "loS",                     // to wait
    "gooseLobby.inProgress":   "qaStaH",                  // is occurring
    "gooseLobby.empty":        "Qujmey tu'lu'be'",        // no games are found

    // -- Tournaments -----------------------------------------------
    "tdetail.participants": "QujwI'pu'",                  // players
    "tdetail.bracket":      "may'mey",                    // battles
    "tdetail.chat":         "ja'chuq",                    // confer together
    "tdetail.start":        "yItagh",                     // begin!
    "tdetail.cancel":       "yIqIl",                      // cancel!
    "tdetail.delete":       "yIQaw'",                     // destroy!
    "tdetail.forfeit":      "jegh",                       // to surrender
    "tstatus.open":         "poS",                        // to be open
    "tstatus.ongoing":      "qaStaH",                     // is occurring
    "tstatus.finished":     "rIn",                        // finished
    "tstatus.cancelled":    "qIlta'",                     // cancelled
    "tstatus.pending":      "loS",                        // to wait

    // -- Profile / admin / status ----------------------------------
    "profile.loading":        "loS...",                   // waiting
    "profile.change":         "choH",                     // to change
    "profile.displayName":    "pong",                     // name
    "profile.notSet":         "Sovbe'lu'",                // it is not known
    "profile.noBio":          "qun tu'lu'be'",            // no history is found
    "profile.viewHistory":    "qun yIlegh",               // see the history!
    "profile.viewAnalytics":  "De' yIlegh",               // see the data!
    "publicProfile.block":    "yIQaw'",                   // destroy!
    "publicProfile.unblock":  "yIchaw'",                  // permit!
    "admin.title":            "la' pa'",                  // commander's room
    "admin.delete":           "Qaw'",                     // to destroy
    "admin.role.user":        "nuv",                      // person
    "admin.role.moderator":   "yaS",                      // officer
    "admin.users.empty":      "nuvpu' tu'lu'be'",         // no people are found
    "status.degraded":        "QaQbe'",                   // it is not good
    "status.checking":        "waHtaH...",                // is testing
    "status.loading":         "loS...",                   // waiting
    "leaderboard.error.load": "Qagh",                     // error
    "history.error.load":     "Qagh",                     // error
    "tournaments.error.load": "Qagh",                     // error
}

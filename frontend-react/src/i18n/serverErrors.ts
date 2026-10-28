// frontend-react/src/i18n/serverErrors.ts
//
// Maps the English text the Django API returns onto translation keys.
//
// -- Why this exists, and why it is a bridge rather than the destination --
//
// The API returns human prose: {"error": "Tournament is full."}. That makes
// the backend a presentation layer, and it means the language of an error is
// decided by a Python file rather than by the user's choice.
//
// The correct fix is for the API to return CODES -- {"code": "tournament_full"}
// -- and let the frontend do all the wording. But that is 181 response sites
// across Django, in files four people are editing concurrently, and every one
// of them is a merge conflict waiting on a feature branch.
//
// So the mapping happens here instead, at the edge. Same user-visible result:
// every server message is translatable. The difference is that this table has
// to be kept in step with the backend by hand.
//
// -- How lookup is made robust --------------------------------------------
//
// Keys are normalised (trimmed, trailing period dropped, lower-cased) before
// comparison, because the backend is inconsistent about punctuation -- it
// returns both "Email required" and "Email required." -- and a punctuation
// edit should not silently drop a translation.
//
// -- What happens to an unmapped string -----------------------------------
//
// It falls through and is shown verbatim, which is exactly what happened
// before this file existed. A new backend error can never render blank or
// crash; the worst case is one English sentence, same as today.

import type { MessageKey } from "./messages/index.ts"

/** trim, collapse whitespace, drop trailing period, lower-case */
export function normalizeServerMessage(text: string): string {
    return text.replace(/\s+/g, " ").trim().replace(/\.+$/, "").toLowerCase()
}

/**
 * Normalised English -> message key.
 *
 * Grouped the way the backend groups them. A few entries deliberately share a
 * key where the backend says the same thing two ways (e.g. the OAauth typo).
 */
const RAW: Record<string, MessageKey> = {
    // -- auth / session --------------------------------------------------
    "authentication required":                    "srv.authRequired",
    "account is deactivated":                     "srv.accountDeactivated",
    "account frozen. please verify your email":   "srv.accountFrozen",
    "account already linked":                     "srv.accountAlreadyLinked",
    "invalid password":                           "srv.invalidPassword",
    "invalid or expired refresh token":           "srv.tokenExpiredRefresh",
    "invalid or expired temporary token":         "srv.tokenExpiredTemp",
    "invalid or expired login token":             "srv.tokenExpiredLogin",
    "invalid or expired link token":              "srv.tokenExpiredLink",
    "invalid or expired token":                   "srv.tokenExpired",
    "invalid token data":                         "srv.tokenInvalidData",
    "invalid token payload":                      "srv.tokenInvalidPayload",
    "no refresh token":                           "srv.noRefreshToken",
    "missing required header":                    "srv.missingHeader",
    "rate limit exceeded. please slow down":      "srv.rateLimited",
    "account temporarily locked. try again later":"srv.accountLocked",
    "token and uid required":                     "srv.tokenUidRequired",

    // -- two-factor ------------------------------------------------------
    "a 2fa device is already configured":         "srv.twofaAlreadyConfigured",
    "invalid totp code":                          "srv.twofaInvalidCode",
    "totp code required":                         "srv.twofaCodeRequired",
    "either password or 2fa code required":       "srv.twofaOrPasswordRequired",

    // -- oauth -----------------------------------------------------------
    "authorization code not found":               "srv.oauthCodeNotFound",
    "authorization code required":                "srv.oauthCodeRequired",
    "missing authorization code":                 "srv.oauthCodeMissing",
    "invalid state parameter":                    "srv.oauthInvalidState",
    "token exchange failed":                      "srv.oauthExchangeFailed",
    "failed to obtain access token":              "srv.oauthNoAccessToken",
    "failed to fetch user info":                  "srv.oauthNoUserInfo",
    "failed to fetch user data from 42":          "srv.oauthNoUserData42",
    "failed to fetch user data from google":      "srv.oauthNoUserDataGoogle",
    "invalid user data from 42":                  "srv.oauthBadUserData42",
    "email not provided by google":               "srv.oauthNoEmailGoogle",
    "oauth credentials not configured":           "srv.oauthNotConfigured",
    "oaauth credentials not configured":          "srv.oauthNotConfigured", // backend typo
    "email mismatch":                             "srv.emailMismatch",
    "username mismatch":                          "srv.usernameMismatch",

    // -- validation ------------------------------------------------------
    "email required":                             "srv.emailRequired",
    "empty message":                              "srv.emptyMessage",
    "invalid json":                               "srv.invalidJson",
    "invalid action. use 'accept' or 'decline'":  "srv.invalidAction",
    "invalid role":                               "srv.invalidRole",
    "invalid duration":                           "srv.invalidDuration",
    "duration must be 1-1440 minutes":            "srv.durationRange",
    "message content must be 2000 max chars":     "srv.messageTooLong",
    "question must be 1-500 chars":               "srv.questionLength",
    "internal server error":                      "srv.internalError",
    "pagination error":                           "srv.paginationError",
    "expected a json object":                     "srv.importNotObject",
    "invalid json file":                          "srv.invalidJsonFile",
    "file too large (max 10mb)":                  "srv.importTooLarge",
    "supported formats: json, csv, xml":          "srv.exportFormat",

    // -- users / friends / blocking --------------------------------------
    "user not found":                             "srv.userNotFound",
    "player does not exist":                      "srv.playerNotFound",
    "cannot delete your own account":             "srv.cannotDeleteSelf",
    "cannot delete other admins":                 "srv.cannotDeleteAdmin",
    "cannot modify your own account":             "srv.cannotModifySelf",
    "cannot modify other admins":                 "srv.cannotModifyAdmin",
    "cannot block yourself":                      "srv.cannotBlockSelf",
    "user already blocked":                       "srv.alreadyBlocked",
    "user not blocked":                           "srv.notBlocked",
    "this user has blocked you":                  "srv.blockedByUser",
    "you have blocked this user":                 "srv.youBlockedUser",
    "you are already friends":                    "srv.alreadyFriends",
    "cannot send friend request":                 "srv.cannotSendRequest",
    "you cannot send a friend request to yourself":"srv.cannotFriendSelf",
    "you cannot respond to your own request":     "srv.cannotRespondOwn",
    "friend request not found":                   "srv.requestNotFound",
    "a pending request already exists between these users": "srv.requestPending",
    "a pending request already pending":          "srv.requestPending",
    "unable to remove friend":                    "srv.cannotRemoveFriend",
    "failed to delete account":                   "srv.deleteAccountFailed",
    "failed to export data":                      "srv.exportFailed",
    "failed to send confirmation email":          "srv.confirmEmailFailed",
    "import failed":                              "srv.importFailed",
    "no api key found":                           "srv.noApiKey",

    // -- chat ------------------------------------------------------------
    "cannot create dm with yourself":             "srv.dmSelf",
    "you are muted in this room":                 "srv.muted",
    "user is not muted":                          "srv.notMuted",
    "cannot mute staff members":                  "srv.cannotMuteStaff",
    "cannot delete staff messages":               "srv.cannotDeleteStaffMsg",
    "invites only in dms":                        "srv.invitesDmOnly",
    "invite expired or invalid":                  "srv.inviteInvalid",
    "cannot accept your own invite":              "srv.cannotAcceptOwnInvite",
    "no text provided":                           "srv.translateNoText",
    "no target_lang provided":                    "srv.translateNoLang",
    "translation failed":                         "srv.translateFailed",

    // -- chess / games ---------------------------------------------------
    "ai user not found. run migrations":          "srv.aiUserMissing",
    "chess coach is offline right now":           "srv.coachOffline",
    "invalid timer preset":                       "srv.invalidTimer",
    "game already started":                       "srv.gameStarted",
    "game is full":                               "srv.gameFull",
    "game is not accepting players":              "srv.gameClosed",
    "game is not in progress":                    "srv.gameNotInProgress",
    "game is not waiting for a player":           "srv.gameNotWaiting",
    "already in this game":                       "srv.alreadyInGame",
    "not in this game":                           "srv.notInGame",
    "you are not a player in this game":          "srv.notPlayerInGame",
    "you cannot join your own game":              "srv.cannotJoinOwnGame",
    "cannot leave a game in progress":            "srv.cannotLeaveInProgress",
    "only waiting games can be cancelled":        "srv.onlyWaitingCancellable",
    "only the creator can cancel the game":       "srv.onlyCreatorCancel",
    "only the creator can start":                 "srv.onlyCreatorStart",
    "max players must be 2-6":                    "srv.maxPlayersRange",
    "min players must be 2 to max_players":       "srv.minPlayersRange",
    "failed to determine starting turn":          "srv.noStartingTurn",
    "only the creator can delete this room":      "srv.onlyCreatorDeleteRoom",

    // -- tournaments -----------------------------------------------------
    "tournament is full":                         "srv.tournamentFull",
    "tournament is not open":                     "srv.tournamentNotOpen",
    "tournament is not open for joining":         "srv.tournamentClosedJoin",
    "tournament is not open for leaving":         "srv.tournamentClosedLeave",
    "tournament is not in progress":              "srv.tournamentNotRunning",
    "tournament is already cancelled":            "srv.tournamentCancelled",
    "tournament is already finished":             "srv.tournamentFinished",
    "you have already joined this tournament":    "srv.tournamentAlreadyJoined",
    "you are not a participant in this tournament":"srv.tournamentNotParticipant",
    "player is not a participant in this tournament":"srv.tournamentPlayerNotIn",
    "at least 2 participants are required to start the tournament": "srv.tournamentNeedTwo",
    "cancel the tournament before deleting":      "srv.tournamentCancelFirst",
    "no active matches to forfeit":               "srv.noMatchesForfeit",
    "no active matches to disqualify":            "srv.noMatchesDisqualify",
    "match is already finished":                  "srv.matchFinished",
    "match is not pending":                       "srv.matchNotPending",
    "a game has already been created for this match": "srv.matchGameExists",
    "you are not a player in this match":         "srv.notPlayerInMatch",
    "winner is required":                         "srv.winnerRequired",
    "winner must be one of the match players":    "srv.winnerNotPlayer",
    "winner user does not exists":                "srv.winnerNotFound",
}

/** Look up a server message. Returns null when unmapped. */
export function serverMessageKey(text: string): MessageKey | null {
    return RAW[normalizeServerMessage(text)] ?? null
}

/** How many backend strings this table covers -- used by the coverage test. */
export const MAPPED_COUNT = Object.keys(RAW).length

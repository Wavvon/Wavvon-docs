# Join forms: the application and the onboarding survey

One form engine, two uses that answer different questions:

| | **Application** | **Onboarding survey** |
|---|---|---|
| Asks | "should we let you in?" | "who are you here, so we can set you up?" |
| Runs | **before** membership, while the joiner is `pending` | **after** membership |
| Read by | a moderator, who approves or rejects | the hub, which maps choices to roles |
| Can stop the joiner | yes: a refused consent, or a rejection | no |

The survey is the role questionnaire already built
([lobby-survey.md](lobby-survey.md), Feature 3). The application is new. A hub
can run either, both, or neither. Status: hub built (Wavvon-server#216,
capability `admission.application`); clients in Wavvon-clients#199.

## Why an application

A hub that is not for everyone (adults only, NSFW content, a closed group with
its own rules) wants two things before someone is inside: to tell the joiner
plainly what this place is, so they can turn back, and to ask enough that a
moderator can decide. The survey cannot do either. It runs after the joiner is
already a member, it only reaches users who came through the lobby, and its
answers serve role mapping, not a decision.

Answers are **self-declared**. A hub cannot verify an age or an identity, and
the form does not pretend to: "are you an adult?" records a claim the joiner
is accountable for, which is what a hub's rules can rely on.

## The engine

A form is an ordered list of questions with a `purpose`
(`application` | `onboarding`); a hub has at most one enabled form per
purpose. Question kinds:

- `text`: short or long free text (`multiline` flag), optional max length.
- `choice`: exactly one option.
- `multi`: any number of options, with optional min/max.
- `consent`: a checkbox with a statement ("I am 18 or older", "I understand
  this hub hosts NSFW content"). Required means it **must be checked**: an
  unchecked required consent stops the form with the hub's own explanation,
  and no application is filed.

Every question has `required` and a `help` text. Role mappings live on
`choice`/`multi` options and are only honoured on an `onboarding` form; on an
application they would hand roles to someone nobody approved yet.

The present `survey_*` tables become the engine's tables, keyed by form.
`survey_answers` holds one `choice_id` per question today, so `multi` needs an
answer-to-choices table. The hub is alpha: the tables are reshaped, not
migrated.

## The application flow

1. **Before joining.** `GET /application` is public, so a client can show the
   form from an invite link or a directory listing before the joiner has a
   seat, and the joiner can decide this is not their place without leaving a
   trace on the hub.
2. **Joining.** An enabled application implies `require_approval`: the joiner
   authenticates, is seated `pending` as today, and submits the answers. A
   `pending` session may reach the application routes and nothing else
   (`PENDING_ALLOWED_PATHS`). A required consent left unchecked is refused by
   the hub too, not only the client.
3. **Review.** The existing approval queue shows the answers next to the
   request, together with any ban-evasion flag
   ([Wavvon-server#208](https://github.com/Wavvon/Wavvon-server/issues/208)).
   The moderator approves, or rejects with a reason the joiner sees.
4. **After a rejection** the joiner stays `pending`, reads the reason, leaves
   the queue, and may apply again after seven days; the previous answers are
   not kept.
5. **After approval**, an onboarding survey, if the hub has one, runs as it
   does today.

The application composes with `invite_only`: an invite and an application can
both be required, or a public hub can drop the invite and let the application
be its gate.

## Privacy

Application answers are personal data the joiner volunteered to one hub. They
are deleted thirty days after the decision,
never federated, never shown to members, and visible only to holders of the
approval permission. The onboarding survey keeps its answers as today, since
roles were derived from them.

## Decisions

See [decisions.md](decisions.md), "One form engine, two forms: the
application before joining, the survey after".

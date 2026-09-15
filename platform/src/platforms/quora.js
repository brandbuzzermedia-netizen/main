import { PlatformAdapter } from './adapter.js';
import { ManualActionRequired } from '../core/errors.js';

/**
 * Quora.
 *
 * Quora publishes no public content or write API for answers and comments.
 * There is no compliant automated path, so this adapter exists to say so
 * clearly and route the work to a person: every operation reports
 * MANUAL_ACTION_REQUIRED, and nothing here scrapes Quora.
 *
 * Opportunities can still be tracked by hand (a team member pastes a question
 * URL), and the AI will draft an answer for a person to post themselves.
 */
export class QuoraAdapter extends PlatformAdapter {
  static platform = 'quora';
  static displayName = 'Quora';
  static requiredScopes = [];
  static capabilities = {
    publish: [],
    comment: false,
    readPublicSearch: false,
    readOwnInsights: false,
    readMentions: false,
    scheduleNatively: false,
    notes: {
      text: 'Quora offers no public write API. Answers must be posted by a person.',
    },
  };

  authorizeUrl() {
    throw new ManualActionRequired(
      'quora',
      'Quora offers no OAuth integration for publishing.',
      'Track Quora work manually: add the question URL as an opportunity and post the approved answer yourself.',
    );
  }

  async publish() {
    throw new ManualActionRequired(
      'quora',
      'Quora has no official publishing API.',
      'Copy the approved answer from the approval centre and post it from your own Quora account.',
    );
  }

  async publishComment() {
    throw new ManualActionRequired(
      'quora',
      'Quora has no official commenting API.',
      'Post the approved reply manually, then mark the opportunity as engaged.',
    );
  }

  /** No scraping. Quora research is operator-supplied. */
  async searchPublic() { return []; }
}

/**
 * Golden set for retrieval evaluation.
 *
 * Queries are written the way a customer actually phrases a request, not the way
 * a policy document is written. That is the whole point: the keyword matcher the
 * prototype shipped could only fire on words copied out of the procedure, and
 * real messages do not talk like policy text.
 *
 * `IN_SCOPE` entries carry the procedure id that a competent human agent would
 * answer from. `OUT_OF_SCOPE` entries have no answer in the corpus at all — they
 * measure whether the Confidence Gate refuses instead of forcing a match.
 *
 * Sample size is 50 in-scope and 15 out-of-scope queries over a five-procedure
 * corpus. That is small, and it is stated rather than hidden: it is enough to
 * compare two retrievers and calibrate a threshold, not enough to publish a
 * benchmark. The Phase 1 exit criteria that assume enterprise scale — index build
 * time and query latency — are measured separately on a synthetic corpus of
 * 5,000 procedures, where scale is the only variable under test.
 */

/** Procedure ids present in `apps/web/src/data/knowledgeBase.json`. */
export const SOP_IDS = ['1', '2', '3', '4', '5'];

export const IN_SCOPE = [
  // --- procedure 1: gifting and virtual currency ---
  { query: 'I sent someone a present during a stream and now I want my money back', sopId: '1' },
  { query: 'how do the little animated presents work and can I turn them back into cash', sopId: '1' },
  { query: 'I am 16, am I allowed to buy the in-app currency', sopId: '1' },
  { query: 'my balance of yellow coins disappeared after I closed my account', sopId: '1' },
  { query: 'when do the creator earnings become withdrawable', sopId: '1' },
  { query: 'is there a minimum before I can cash out what viewers sent me', sopId: '1' },
  { query: 'I accidentally spent money in the app, is that reversible', sopId: '1' },
  { query: 'why can I not send presents, it says I am too young', sopId: '1' },
  { query: 'the platform took a cut when I cashed out, why', sopId: '1' },
  { query: 'can I transfer my coins to a friends account', sopId: '1' },

  // --- procedure 2: community guidelines violation appeal ---
  { query: 'my account got taken down for something I did not post', sopId: '2' },
  { query: 'I received a warning from the moderation team, how do I fight it', sopId: '2' },
  { query: 'I was suspended and I think it was a mistake', sopId: '2' },
  { query: 'how long does it take to hear back after I dispute a strike', sopId: '2' },
  { query: 'my content was removed without any explanation', sopId: '2' },
  { query: 'someone reported me and now I am locked out, I want to complain', sopId: '2' },
  { query: 'I have a black mark on my record that should not be there', sopId: '2' },
  { query: 'where do I go to contest a moderation decision', sopId: '2' },
  { query: 'I keep getting flagged for the same thing', sopId: '2' },
  { query: 'my video got taken down, can a human review that', sopId: '2' },

  // --- procedure 3: account security and login ---
  { query: 'I cannot get into my profile anymore', sopId: '3' },
  { query: 'I think someone else is using my account', sopId: '3' },
  { query: 'I forgot my credentials', sopId: '3' },
  { query: 'how do I add an extra layer of protection to my account', sopId: '3' },
  { query: 'I got an email saying my account was accessed from another country', sopId: '3' },
  { query: 'the app keeps telling me my details are wrong', sopId: '3' },
  { query: 'I lost access after changing phones', sopId: '3' },
  { query: 'someone changed my sign-in details', sopId: '3' },
  { query: 'I need to secure my profile urgently', sopId: '3' },
  { query: 'I am locked out and the reset link does not work', sopId: '3' },

  // --- procedure 4: host eligibility ---
  { query: 'what do I need before I can start broadcasting', sopId: '4' },
  { query: 'why is the go live button not showing for me', sopId: '4' },
  { query: 'how many people need to follow me before I can stream', sopId: '4' },
  { query: 'am I old enough to go live in my country', sopId: '4' },
  { query: 'I meet all the criteria but the option is not there', sopId: '4' },
  { query: 'do I need a certain number of fans to start streaming', sopId: '4' },
  { query: 'how do I sign up to become a broadcaster', sopId: '4' },
  { query: 'my friend can stream and I cannot, why', sopId: '4' },
  { query: 'is there an age limit for streaming', sopId: '4' },
  { query: 'what are the rules to be allowed to broadcast', sopId: '4' },

  // --- procedure 5: livestream penalty appeal ---
  { query: 'my streaming access was taken away, how do I get it back', sopId: '5' },
  { query: 'I have been told I cannot receive presents anymore, why', sopId: '5' },
  { query: 'how long is my suspension for', sopId: '5' },
  { query: 'my reach suddenly dropped, did I do something wrong', sopId: '5' },
  { query: 'I want to appeal the restriction on my broadcasts', sopId: '5' },
  { query: 'I lost the ability to go live with a guest', sopId: '5' },
  { query: 'is my punishment permanent', sopId: '5' },
  { query: 'my channel is being limited and nobody told me why', sopId: '5' },
  { query: 'I was punished for something during a stream and I disagree', sopId: '5' },
  { query: 'how do I get my streaming privileges restored', sopId: '5' },
];

export const OUT_OF_SCOPE = [
  'how do I delete my payment card from the app',
  'can you help me set up a business account for my company',
  'the app crashes every time I open the camera',
  'how do I change the language in the settings',
  'do you offer gift cards for the holidays',
  'I want to become a partner brand and advertise',
  'my notifications stopped working',
  'how do I block someone who is harassing me in the comments',
  'can I download my videos to my phone',
  'what is the maximum length of a video I can upload',
  'how do I apply for a job at the company',
  'my wifi keeps disconnecting during streams',
  'can I use the app on my smart tv',
  'how do I report a bug in the latest update',
  'when is the next creator event in my city',
];

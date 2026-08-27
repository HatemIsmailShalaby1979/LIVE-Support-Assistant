import { useState } from 'react';
import knowledgeBase from './data/knowledgeBase.json';

interface PolicyEntry {
  id: string;
  title: string;
  category: string;
  triggerKeywords: string[];
  summary: string;
  suggestedReply: string;
  escalationRequired: boolean;
  escalationReason: string;
}

function App() {
  const [inputText, setInputText] = useState('');
  const [matchedPolicy, setMatchedPolicy] = useState<PolicyEntry | null>(null);
  const [suggestedReply, setSuggestedReply] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const findBestMatch = () => {
    setHasSearched(true);
    const inputLower = inputText.toLowerCase();
    
    let bestMatch: PolicyEntry | null = null;
    let highestScore = 0;

    const policies = knowledgeBase as PolicyEntry[];
    for (const policy of policies) {
      let score = 0;
      for (const keyword of policy.triggerKeywords) {
        if (inputLower.includes(keyword.toLowerCase())) {
          score++;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = policy;
      }
    }

    // Require at least 2 keyword matches for confidence
    if (bestMatch !== null && highestScore >= 2) {
      setMatchedPolicy(bestMatch);
      setSuggestedReply(bestMatch.suggestedReply);
    } else {
      setMatchedPolicy(null);
      setSuggestedReply('');
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(suggestedReply);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">LIVE Support Assistant — Demo Build</h1>
          <p className="text-blue-100 text-sm mt-1">Portfolio recreation using public help-center content</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Input & Matched Policy */}
          <div className="space-y-6">
            {/* Input Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Customer Message</h2>
              <textarea
                className="w-full h-40 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Paste the customer's message here..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <button
                onClick={findBestMatch}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
              >
                Find Answer
              </button>
            </div>

            {/* Matched Policy Summary */}
            {hasSearched && matchedPolicy && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">Matched Policy</h2>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                    {matchedPolicy.category}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{matchedPolicy.title}</h3>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <p className="text-gray-700 whitespace-pre-wrap">{matchedPolicy.summary}</p>
                </div>
              </div>
            )}

            {/* No Match Found */}
            {hasSearched && !matchedPolicy && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-lg">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-medium text-yellow-800">No Confident Match Found</h3>
                    <p className="mt-2 text-yellow-700">
                      The system could not find a confident match for this inquiry. Please escalate to human review.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Suggested Reply & Escalation */}
          <div className="space-y-6">
            {/* Suggested Reply */}
            {matchedPolicy && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Suggested Reply</h2>
                <textarea
                  className="w-full h-48 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  value={suggestedReply}
                  onChange={(e) => setSuggestedReply(e.target.value)}
                />
                <button
                  onClick={copyToClipboard}
                  className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy to Clipboard
                </button>
              </div>
            )}

            {/* Escalation Panel */}
            {matchedPolicy && (
              <div className={`rounded-lg shadow-md p-6 ${matchedPolicy.escalationRequired ? 'bg-red-50 border-l-4 border-red-500' : 'bg-green-50 border-l-4 border-green-500'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-800">Escalation Status</h2>
                  <span className={`px-4 py-2 text-sm font-bold rounded-full ${matchedPolicy.escalationRequired ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {matchedPolicy.escalationRequired ? '⚠️ Escalation Needed' : '✓ No Escalation Required'}
                  </span>
                </div>
                {matchedPolicy.escalationRequired ? (
                  <div>
                    <p className="text-red-700 font-medium mb-2">Reason:</p>
                    <p className="text-red-600 bg-white p-3 rounded border border-red-200">
                      {matchedPolicy.escalationReason}
                    </p>
                  </div>
                ) : (
                  <p className="text-green-700">This inquiry can be resolved with the suggested reply above.</p>
                )}
              </div>
            )}

            {/* Initial State */}
            {!hasSearched && (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
                <div className="text-gray-400 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <p className="text-gray-600">Enter a customer message and click "Find Answer" to get started.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-gray-600 text-sm">
          <p>LIVE Support Assistant Demo — Built with React + Vite + TypeScript + Tailwind CSS</p>
        </div>
      </footer>
    </div>
  );
}

export default App;

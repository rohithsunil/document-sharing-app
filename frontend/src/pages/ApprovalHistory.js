// ApprovalHistory.js
import React from "react";

function ApprovalHistory({ history, className }) {
  // Helper function to get icon based on action type
  const getActionIcon = (actionType) => {
    switch (actionType) {
      case "approve":
        return (
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
        );
      case "reject":
        return (
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        );
      case "revert":
        return (
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  // Helper function to get background color based on action type
  const getActionColor = (actionType) => {
    switch (actionType) {
      case "approve":
        return "bg-green-500";
      case "reject":
        return "bg-red-500";
      case "revert":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Approval History</h3>
      </div>

      {/* History List */}
      <div className="px-4 py-2 max-h-96 overflow-y-auto">
        {history.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">No approval history yet</p>
        ) : (
          <div className="flow-root">
            <ul className="-mb-8">
              {history.map((item, index) => (
                <li key={item.history_id}>
                  <div className="relative pb-8">
                    {/* Vertical line connecting events */}
                    {index < history.length - 1 && (
                      <span
                        className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                        aria-hidden="true"
                      />
                    )}

                    <div className="relative flex space-x-3">
                      {/* Action Icon */}
                      <div>
                        <span
                          className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${getActionColor(
                            item.action_type,
                          )}`}
                        >
                          {getActionIcon(item.action_type)}
                        </span>
                      </div>

                      {/* Action Details */}
                      <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                        <div>
                          <p className="text-sm text-gray-500">
                            {item.action_type.charAt(0).toUpperCase() +
                              item.action_type.slice(1)}{" "}
                            by{" "}
                            <span className="font-medium text-gray-900">
                              {item.user.username}
                            </span>
                          </p>
                          {item.comments && (
                            <p className="mt-1 text-sm text-gray-600">
                              {item.comments}
                            </p>
                          )}
                          {item.previous_status && item.new_status && (
                            <p className="mt-1 text-xs text-gray-500">
                              Status changed from{" "}
                              <span className="font-medium">
                                {item.previous_status}
                              </span>{" "}
                              to{" "}
                              <span className="font-medium">
                                {item.new_status}
                              </span>
                            </p>
                          )}
                        </div>
                        <div className="text-right text-sm whitespace-nowrap text-gray-500">
                          <time dateTime={item.action_date}>
                            {new Date(item.action_date).toLocaleString()}
                          </time>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default ApprovalHistory;

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function Dashboard() {
  const [documents, setDocuments] = useState([]);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusMessages, setStatusMessages] = useState({});
  const [actionInProgress, setActionInProgress] = useState(false);

  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));

  const fetchDocuments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("documents")
        .select(
          `
          *,
          shared_documents!inner(*),
          comments(*),
          uploaded_by_user:uploaded_by (username)
        `,
        )
        .eq("shared_documents.shared_with_user_id", user?.user_id);

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
      setError("Failed to fetch documents");
    }
  }, [user?.user_id]);

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .neq("user_id", user?.user_id);

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
      setError("Failed to fetch users");
    }
  }, [user?.user_id]);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchDocuments();
    fetchUsers();
  }, [navigate, user, fetchDocuments, fetchUsers]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !title || selectedUsers.length === 0) {
      setError("Please fill all fields");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;

      const { error: storageError } = await supabase.storage
        .from("documents")
        .upload(fileName, file);

      if (storageError) {
        throw storageError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(fileName);

      console.log("File uploaded successfully:", publicUrl);

      const { data: docData, error: docError } = await supabase
        .from("documents")
        .insert([
          {
            title,
            file_url: publicUrl,
            uploaded_by: user.user_id,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (docError) {
        console.error("Document creation error:", docError);
        throw docError;
      }

      console.log("Document record created:", docData);

      for (const userId of selectedUsers) {
        const { error: shareError } = await supabase
          .from("shared_documents")
          .insert([
            {
              document_id: docData.document_id,
              shared_with_user_id: userId,
            },
          ]);

        if (shareError) {
          console.error("Error sharing document:", shareError);
          throw shareError;
        }
      }

      setTitle("");
      setFile(null);
      setSelectedUsers([]);
      setIsUploadModalOpen(false);
      fetchDocuments();
    } catch (error) {
      console.error("Error details:", error);
      setError(error.message || "Error uploading document");
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentStatus = async (documentId, newStatus, currentStatus) => {
    if (actionInProgress) return;

    if (currentStatus === "approved" || currentStatus === "rejected") {
      setError(`Document has already been ${currentStatus}`);
      return;
    }

    setActionInProgress(true);
    try {
      // Simplified update - only update status
      const { error: updateError } = await supabase
        .from("documents")
        .update({ status: newStatus })
        .eq("document_id", documentId);

      if (updateError) throw updateError;

      const { error: commentError } = await supabase.from("comments").insert([
        {
          document_id: documentId,
          comment_text: `Document ${newStatus} by ${user.username}`,
          commented_by: user.user_id,
        },
      ]);

      if (commentError) throw commentError;

      setStatusMessages((prev) => ({
        ...prev,
        [documentId]: {
          type: "success",
          message: `Document successfully ${newStatus}`,
        },
      }));

      fetchDocuments();
    } catch (error) {
      console.error("Error updating document status:", error);
      setStatusMessages((prev) => ({
        ...prev,
        [documentId]: {
          type: "error",
          message: `Error: ${error.message}`,
        },
      }));
    } finally {
      setActionInProgress(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">
                Document Management System
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Welcome, {user?.username}</span>
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors duration-200"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded relative">
            {error}
          </div>
        )}

        {/* Upload Button */}
        <div className="mb-6">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors duration-200 flex items-center"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Upload New Document
          </button>
        </div>

        {/* Documents Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <div
              key={doc.document_id}
              className="bg-white overflow-hidden shadow-sm rounded-lg hover:shadow-md transition-shadow duration-200"
            >
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {doc.title}
                </h3>
                <div className="flex flex-col space-y-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      doc.status === "approved"
                        ? "bg-green-100 text-green-800"
                        : doc.status === "rejected"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {doc.status}
                  </span>

                  {statusMessages[doc.document_id] && (
                    <div
                      className={`text-sm ${
                        statusMessages[doc.document_id].type === "success"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {statusMessages[doc.document_id].message}
                    </div>
                  )}

                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                    View Document
                  </a>

                  {doc.status === "pending" && (
                    <div className="flex justify-between space-x-2">
                      <button
                        onClick={() =>
                          handleDocumentStatus(
                            doc.document_id,
                            "approved",
                            doc.status,
                          )
                        }
                        disabled={actionInProgress}
                        className={`flex-1 inline-flex justify-center items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                          actionInProgress
                            ? "bg-gray-400 cursor-not-allowed"
                            : "bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        }`}
                      >
                        <svg
                          className="w-4 h-4 mr-2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Approve
                      </button>
                      <button
                        onClick={() =>
                          handleDocumentStatus(
                            doc.document_id,
                            "rejected",
                            doc.status,
                          )
                        }
                        disabled={actionInProgress}
                        className={`flex-1 inline-flex justify-center items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                          actionInProgress
                            ? "bg-gray-400 cursor-not-allowed"
                            : "bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        }`}
                      >
                        <svg
                          className="w-4 h-4 mr-2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity"
              aria-hidden="true"
              onClick={() => setIsUploadModalOpen(false)}
            >
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Upload New Document
                </h3>
                <form onSubmit={handleUpload}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Enter document title"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      File
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      onChange={(e) => setFile(e.target.files[0])}
                      className="w-full"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Share with
                    </label>
                    <select
                      multiple
                      value={selectedUsers}
                      onChange={(e) =>
                        setSelectedUsers(
                          Array.from(
                            e.target.selectedOptions,
                            (option) => option.value,
                          ),
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      {users.map((user) => (
                        <option key={user.user_id} value={user.user_id}>
                          {user.username}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-5 sm:mt-6 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setIsUploadModalOpen(false)}
                      className="inline-flex justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className={`inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md ${
                        loading
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      }`}
                    >
                      {loading ? "Uploading..." : "Upload"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;

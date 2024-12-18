// Dashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import DocumentViewer from "./DocumentViewer";
import { useDataFetching } from "../hooks/useDataFetching";

function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));

  // Use the custom hook
  const {
    documents,
    users,
    loading: dataLoading,
    error: dataError,
    fetchData,
  } = useDataFetching(user);

  // Local state for UI
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [newVersionFile, setNewVersionFile] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [documentToUpdate, setDocumentToUpdate] = useState(null);
  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    fetchData();

    const refreshInterval = setInterval(() => {
      fetchData(true);
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(refreshInterval);
  }, [user, navigate, fetchData]);

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
      const fileName = `${Date.now()}_v1.${fileExt}`;

      const { error: storageError } = await supabase.storage
        .from("documents")
        .upload(fileName, file);

      if (storageError) throw storageError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(fileName);

      // Create document record
      const { data: docData, error: docError } = await supabase
        .from("documents")
        .insert([
          {
            title,
            file_url: publicUrl,
            uploaded_by: user.user_id,
            status: "pending",
            current_version: 1,
          },
        ])
        .select()
        .single();

      if (docError) throw docError;

      // Add initial version to history
      const { error: historyError } = await supabase
        .from("document_history")
        .insert([
          {
            document_id: docData.document_id,
            action_type: "initial_upload",
            action_by: user.user_id,
            version: 1,
            file_url: publicUrl,
            comments: "Initial version",
          },
        ]);

      if (historyError) throw historyError;

      // Share with selected users
      for (const userId of selectedUsers) {
        const { error: shareError } = await supabase
          .from("shared_documents")
          .insert([
            {
              document_id: docData.document_id,
              shared_with_user_id: userId,
              current_version: 1,
              approval_status: "pending",
              is_approved: false,
            },
          ]);

        if (shareError) throw shareError;
      }

      setTitle("");
      setFile(null);
      setSelectedUsers([]);
      setIsUploadModalOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error details:", error);
      setError(error.message || "Error uploading document");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadNewVersion = (document) => {
    setDocumentToUpdate(document);
    setIsVersionModalOpen(true);
  };
  const handleVersionSubmit = async (e) => {
    e.preventDefault();

    if (!newVersionFile) {
      setError("Please select a file first");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const newVersion = documentToUpdate.current_version + 1;
      const fileExt = newVersionFile.name.split(".").pop();
      const fileName = `${Date.now()}_v${newVersion}.${fileExt}`;

      const { error: storageError } = await supabase.storage
        .from("documents")
        .upload(fileName, newVersionFile);

      if (storageError) throw storageError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(fileName);

      // Update document record
      const { error: updateError } = await supabase
        .from("documents")
        .update({
          file_url: publicUrl,
          current_version: newVersion,
          status: "pending",
        })
        .eq("document_id", documentToUpdate.document_id);

      if (updateError) throw updateError;

      // Reset shared documents approval status
      const { error: shareError } = await supabase
        .from("shared_documents")
        .update({
          approval_status: "pending",
          is_approved: false,
          current_version: newVersion,
        })
        .eq("document_id", documentToUpdate.document_id);

      if (shareError) throw shareError;

      // Add version history entry
      const { error: historyError } = await supabase
        .from("document_history")
        .insert([
          {
            document_id: documentToUpdate.document_id,
            action_type: "version_update",
            action_by: user.user_id,
            version: newVersion,
            file_url: publicUrl,
            comments: `Updated to version ${newVersion}`,
          },
        ]);

      if (historyError) throw historyError;

      setNewVersionFile(null);
      setIsVersionModalOpen(false);
      setDocumentToUpdate(null);
      fetchData();
    } catch (error) {
      console.error("Error updating version:", error);
      setError(error.message || "Error updating document version");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (documentId) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this document? This action cannot be undone.",
    );

    if (!confirmDelete) return;

    try {
      // Get all versions of the document
      const { data: versions, error: versionsError } = await supabase
        .from("document_history")
        .select("file_url")
        .eq("document_id", documentId);

      if (versionsError) throw versionsError;

      // Delete all version files from storage
      const fileNames = versions
        .map((v) => v.file_url?.split("/").pop())
        .filter(Boolean);

      if (fileNames.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("documents")
          .remove(fileNames);

        if (storageError) throw storageError;
      }

      // Delete related records
      const { error: sharedError } = await supabase
        .from("shared_documents")
        .delete()
        .eq("document_id", documentId);

      if (sharedError) throw sharedError;

      const { error: commentsError } = await supabase
        .from("comments")
        .delete()
        .eq("document_id", documentId);

      if (commentsError) throw commentsError;

      const { error: historyError } = await supabase
        .from("document_history")
        .delete()
        .eq("document_id", documentId);

      if (historyError) throw historyError;

      const { error: docError } = await supabase
        .from("documents")
        .delete()
        .eq("document_id", documentId);

      if (docError) throw docError;

      fetchData();
    } catch (error) {
      console.error("Error deleting document:", error);
      setError("Failed to delete document");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };
  // Render Functions
  const renderDocumentCard = (doc, isUploaded = false) => (
    <div
      key={doc.document_id}
      className="bg-white overflow-hidden shadow-sm rounded-lg hover:shadow-md transition-shadow duration-200"
    >
      <div className="px-4 py-5 sm:p-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{doc.title}</h3>
            {!isUploaded && (
              <p className="text-sm text-gray-500 mt-1">
                Shared by: {doc.uploaded_by_user.username}
              </p>
            )}
          </div>
          {isUploaded && (
            <div className="flex space-x-2">
              <button
                onClick={() => handleDeleteDocument(doc.document_id)}
                className="text-red-600 hover:text-red-700"
                title="Delete Document"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
              <button
                onClick={() => handleUploadNewVersion(doc)}
                className="text-blue-600 hover:text-blue-700"
                title="Upload New Version"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="mt-2">
          <span className="text-sm text-gray-500">
            Version: {doc.current_version || 1}
          </span>
          <span
            className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              doc.status === "approved"
                ? "bg-green-100 text-green-800"
                : doc.status === "rejected"
                  ? "bg-red-100 text-red-800"
                  : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {doc.status}
          </span>
        </div>

        {isUploaded && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-500">Shared with:</h4>
            <div className="mt-2 space-y-1">
              {doc.shared_documents.map((shared) => (
                <div
                  key={shared.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{shared.users.username}</span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      shared.approval_status === "approved"
                        ? "bg-green-100 text-green-800"
                        : shared.approval_status === "rejected"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {shared.approval_status || "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <button
            onClick={() => setSelectedDocument(doc)}
            className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            View Document
          </button>
        </div>
      </div>
    </div>
  );

  // Main Render
  return (
    <div className="min-h-screen bg-gray-100">
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

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {(error || dataError) && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded relative">
            {error || dataError}
            <button
              onClick={() => setError(null)}
              className="absolute top-0 right-0 p-3"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        )}

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

        {dataLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Documents You've Shared
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {documents.uploaded.map((doc) => renderDocumentCard(doc, true))}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Documents Shared with You
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {documents.shared.map((doc) => renderDocumentCard(doc))}
              </div>
            </div>
          </>
        )}
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
                      className="inline-flex justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className={`inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md ${
                        loading
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-indigo-700"
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

      {/* Version Upload Modal */}
      {isVersionModalOpen && documentToUpdate && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity"
              aria-hidden="true"
              onClick={() => {
                setIsVersionModalOpen(false);
                setDocumentToUpdate(null);
                setNewVersionFile(null);
              }}
            >
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Upload New Version for "{documentToUpdate.title}"
                </h3>
                <form onSubmit={handleVersionSubmit}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Version: {documentToUpdate.current_version || 1}
                    </label>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      File
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      onChange={(e) => setNewVersionFile(e.target.files[0])}
                      className="w-full"
                    />
                  </div>
                  <div className="mt-5 sm:mt-6 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsVersionModalOpen(false);
                        setDocumentToUpdate(null);
                        setNewVersionFile(null);
                      }}
                      className="inline-flex justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !newVersionFile}
                      className={`inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md ${
                        loading || !newVersionFile
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-indigo-700"
                      }`}
                    >
                      {loading ? "Uploading..." : "Upload New Version"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {selectedDocument && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-gray-900 bg-opacity-75">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 overflow-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <div className="w-full max-w-6xl bg-white rounded-lg shadow-xl">
                  <div className="flex justify-between items-center p-4 border-b">
                    <div className="flex items-center space-x-4">
                      <h2 className="text-lg font-medium">
                        {selectedDocument.title}
                      </h2>
                      <span className="text-sm text-gray-500">
                        Version: {selectedDocument.current_version || 1}
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedDocument(null)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <span className="sr-only">Close</span>
                      <svg
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                  <DocumentViewer
                    documentId={selectedDocument.document_id}
                    documentTitle={selectedDocument.title}
                    currentUser={user}
                    selectedDocument={selectedDocument}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;

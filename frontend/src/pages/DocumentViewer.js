// DocumentViewer.js
import React, { useState, useCallback, useEffect } from "react";
import { Document, Page } from "react-pdf";
import { pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { supabase } from "../supabaseClient";
import ApprovalHistory from "./ApprovalHistory";
import ConfirmationDialog from "./ConfirmationDialog";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

function DocumentViewer({
  documentId,
  documentTitle,
  currentUser,
  selectedDocument,
}) {
  // ----------------
  // State Management
  // ----------------
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [comments, setComments] = useState([]);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [comment, setComment] = useState("");
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hoveredComment, setHoveredComment] = useState(null);
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(null);
  const [documentStatus, setDocumentStatus] = useState(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [error, setError] = useState(null);
  const [currentVersion, setCurrentVersion] = useState(1);
  const [availableVersions, setAvailableVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(currentVersion);
  const [documentUrl, setDocumentUrl] = useState(selectedDocument?.file_url);

  // Document Uploader Check
  const isDocumentUploader =
    selectedDocument?.uploaded_by === currentUser?.user_id;
  // ----------------
  // Data Fetching
  // ----------------
  const fetchData = useCallback(async () => {
    try {
      // Fetch comments for current version
      const { data: commentsData, error: commentsError } = await supabase
        .from("comments")
        .select(
          `
            *,
            users!comments_commented_by_fkey(username)
          `,
        )
        .eq("document_id", documentId)
        .eq("version", selectedVersion);

      if (commentsError) throw commentsError;

      // Fetch shared document status
      const { data: sharedDocs, error: sharedDocError } = await supabase
        .from("shared_documents")
        .select("*")
        .eq("document_id", documentId)
        .eq("shared_with_user_id", currentUser.user_id);

      if (sharedDocError) throw sharedDocError;

      // Fetch approval history
      const { data: historyData, error: historyError } = await supabase
        .from("document_history")
        .select(
          `
            *,
            user:users!document_history_action_by_fkey(username)
          `,
        )
        .eq("document_id", documentId)
        .order("action_date", { ascending: true });

      if (historyError) throw historyError;

      setComments(commentsData || []);
      setApprovalHistory(historyData || []);
      setDocumentStatus(sharedDocs?.[0]?.approval_status || "pending");
      setCurrentVersion(sharedDocs?.[0]?.current_version || 1);
    } catch (error) {
      console.error("Error fetching data:", error);
      setError("Failed to load document data");
    }
  }, [documentId, currentUser.user_id, selectedVersion]);

  // ----------------
  // Version Handling
  // ----------------
  const fetchVersions = useCallback(async () => {
    try {
      const { data: historyData, error: historyError } = await supabase
        .from("document_history")
        .select("version, file_url, action_type")
        .eq("document_id", documentId)
        .or("action_type.eq.initial_upload,action_type.eq.version_update")
        .order("version", { ascending: false });

      if (historyError) throw historyError;

      const { data: currentDoc, error: docError } = await supabase
        .from("documents")
        .select("current_version, file_url")
        .eq("document_id", documentId)
        .single();

      if (docError) throw docError;

      let allVersions = [];

      // Add current version
      if (currentDoc) {
        allVersions.push({
          version: currentDoc.current_version,
          file_url: currentDoc.file_url,
        });
      }

      // Add historical versions
      if (historyData) {
        historyData.forEach((h) => {
          if (!allVersions.some((v) => v.version === h.version)) {
            allVersions.push({
              version: h.version,
              file_url: h.file_url,
            });
          }
        });
      }

      // Add version 1 if not present
      if (!allVersions.some((v) => v.version === 1)) {
        allVersions.push({
          version: 1,
          file_url: selectedDocument?.file_url,
        });
      }

      // Sort versions
      allVersions.sort((a, b) => b.version - a.version);
      setAvailableVersions(allVersions);
    } catch (error) {
      console.error("Error fetching versions:", error);
    }
  }, [documentId, selectedDocument]);

  const handleVersionChange = (newVersion) => {
    const version = availableVersions.find(
      (v) => v.version === parseInt(newVersion),
    );
    if (version) {
      setSelectedVersion(parseInt(newVersion));
      setDocumentUrl(version.file_url);
      fetchData();
    }
  };

  // Initial data load
  useEffect(() => {
    fetchData();
    fetchVersions();
  }, [fetchData, fetchVersions]);

  // ----------------
  // Approval Handling
  // ----------------
  const handleApprovalAction = async (action) => {
    try {
      setLoading(true);
      setError(null);

      const newStatus =
        action === "revert"
          ? "pending"
          : action === "approve"
            ? "approved"
            : action === "reject"
              ? "rejected"
              : "pending";

      const currentDate = new Date().toISOString();

      // Get all shared documents
      const { data: allSharedDocs, error: findError } = await supabase
        .from("shared_documents")
        .select("*")
        .eq("document_id", documentId);

      if (findError) throw findError;

      const userSharedDoc = allSharedDocs.find(
        (doc) => doc.shared_with_user_id === currentUser.user_id,
      );

      if (!userSharedDoc) {
        throw new Error("Shared document record not found");
      }

      //Update approval status
      const { data: updateData, error: updateError } = await supabase
        .from("shared_documents")
        .update({
          approval_status: newStatus,
          is_approved: action === "approve",
          approval_date: currentDate,
          approval_history: userSharedDoc.approval_history
            ? [
                ...userSharedDoc.approval_history,
                {
                  status: newStatus,
                  date: currentDate,
                  user: currentUser.user_id,
                  reason: confirmReason,
                  version: selectedVersion,
                },
              ]
            : [
                {
                  status: newStatus,
                  date: currentDate,
                  user: currentUser.user_id,
                  reason: confirmReason,
                  version: selectedVersion,
                },
              ],
        })
        .eq("id", userSharedDoc.id)
        .select();

      if (updateError) throw updateError;

      console.log("Document status updated:", updateData); // Add this line to use the variable

      // Check if all users have approved
      const updatedDocs = allSharedDocs.map((doc) =>
        doc.id === userSharedDoc.id
          ? {
              ...doc,
              approval_status: newStatus,
              is_approved: action === "approve",
            }
          : doc,
      );

      const allApproved = updatedDocs.every((doc) => doc.is_approved === true);

      if (allApproved) {
        const { error: docUpdateError } = await supabase
          .from("documents")
          .update({ status: "approved" })
          .eq("document_id", documentId);

        if (docUpdateError) throw docUpdateError;
      }

      // Add to history
      const { error: historyError } = await supabase
        .from("document_history")
        .insert([
          {
            document_id: documentId,
            action_type: action,
            action_by: currentUser.user_id,
            action_date: currentDate,
            previous_status: documentStatus,
            new_status: newStatus,
            version: selectedVersion,
            comments: confirmReason,
          },
        ]);

      if (historyError) throw historyError;

      setConfirmReason("");
      setShowConfirmDialog(null);
      await fetchData();
    } catch (error) {
      console.error("Error updating approval status:", error);
      setError(error.message || "Failed to update approval status");
    } finally {
      setLoading(false);
    }
  };
  // ----------------
  // Comment Handling
  // ----------------
  const handlePageClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    setSelectedPosition({ x, y });
    setShowCommentForm(true);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;

    try {
      setLoading(true);
      setError(null);

      const newComment = {
        document_id: documentId,
        comment_text: comment,
        commented_by: currentUser.user_id,
        page_number: pageNumber,
        x_position: selectedPosition?.x || null,
        y_position: selectedPosition?.y || null,
        version: selectedVersion,
      };

      const { error: commentError } = await supabase
        .from("comments")
        .insert([newComment]);

      if (commentError) throw commentError;

      setComment("");
      setShowCommentForm(false);
      await fetchData();
    } catch (error) {
      console.error("Error adding comment:", error);
      setError("Failed to add comment");
    } finally {
      setLoading(false);
    }
  };

  const downloadCommentsCSV = () => {
    const csvContent = [
      ["User", "Page", "Comment", "Date", "Version"],
      ...comments.map((comment) => [
        comment.users?.username || "Unknown User",
        comment.page_number || "N/A",
        comment.comment_text,
        new Date(comment.created_at).toLocaleString(),
        comment.version || "1",
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${documentTitle}-comments.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // ----------------
  // Component Rendering
  // ----------------
  return (
    <div className="document-viewer">
      <div className="document-main">
        {/* Error Display */}
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => setError(null)} className="error-close">
              ×
            </button>
          </div>
        )}

        {/* Status Banner */}
        <div className={`status-banner ${documentStatus || "pending"}`}>
          <div className="status-content">
            <span className="status-text">
              Status:{" "}
              {documentStatus?.charAt(0).toUpperCase() +
                documentStatus?.slice(1) || "Pending"}
            </span>
            <span className="version-text">Version: {selectedVersion}</span>
          </div>
          {!isDocumentUploader && (
            <div className="status-actions">
              {documentStatus === "pending" ? (
                <>
                  <button
                    onClick={() => setShowConfirmDialog("approve")}
                    className="action-button approve"
                    disabled={loading}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setShowConfirmDialog("reject")}
                    className="action-button reject"
                    disabled={loading}
                  >
                    Reject
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowConfirmDialog("revert")}
                  className="action-button revert"
                  disabled={loading}
                >
                  Revert Decision
                </button>
              )}
            </div>
          )}
        </div>
        {/* Controls Section */}
        <div className="controls-section">
          {/* Version Selector */}
          <div className="version-controls">
            <select
              value={selectedVersion}
              onChange={(e) => handleVersionChange(e.target.value)}
              className="version-selector"
            >
              {availableVersions.map((version) => (
                <option key={version.version} value={version.version}>
                  Version {version.version}
                </option>
              ))}
            </select>
          </div>

          {/* PDF Controls */}
          <div className="pdf-controls">
            <div className="navigation-controls">
              <button
                onClick={() => setPageNumber((prev) => Math.max(1, prev - 1))}
                disabled={pageNumber <= 1}
                className="nav-button"
              >
                Previous
              </button>
              <span className="page-info">
                Page {pageNumber} of {numPages || "-"}
              </span>
              <button
                onClick={() =>
                  setPageNumber((prev) => Math.min(numPages, prev + 1))
                }
                disabled={pageNumber >= numPages}
                className="nav-button"
              >
                Next
              </button>
            </div>
            <div className="zoom-controls">
              <button
                onClick={() => setScale((prev) => Math.min(prev + 0.2, 3))}
                className="zoom-button"
              >
                Zoom In
              </button>
              <button
                onClick={() => setScale((prev) => Math.max(prev - 0.2, 0.5))}
                className="zoom-button"
              >
                Zoom Out
              </button>
            </div>
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="pdf-container" onClick={handlePageClick}>
          <Document
            file={documentUrl}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            loading={<div className="loading-spinner" />}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              loading={<div className="loading-spinner" />}
            />

            {/* Comment Markers */}
            {comments
              .filter((c) => c.page_number === pageNumber)
              .map((comment, index) => (
                <div
                  key={comment.comment_id}
                  className="comment-marker"
                  style={{
                    left: `${comment.x_position}%`,
                    top: `${comment.y_position}%`,
                  }}
                  onMouseEnter={() => setHoveredComment(comment)}
                  onMouseLeave={() => setHoveredComment(null)}
                >
                  <div className="marker-circle">
                    <span>{index + 1}</span>
                  </div>
                  {hoveredComment?.comment_id === comment.comment_id && (
                    <div className="comment-tooltip">
                      <div className="tooltip-header">
                        {comment.users?.username}
                      </div>
                      <div className="tooltip-content">
                        {comment.comment_text}
                      </div>
                      <div className="tooltip-footer">
                        {new Date(comment.created_at).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </Document>
        </div>
      </div>

      {/* Sidebar */}
      <div className="document-sidebar">
        <ApprovalHistory history={approvalHistory} />

        <div className="comments-section">
          <div className="comments-header">
            <h3>Comments (Version {selectedVersion})</h3>
            <button onClick={downloadCommentsCSV} className="download-button">
              Download CSV
            </button>
          </div>

          {showCommentForm && (
            <form onSubmit={handleAddComment} className="comment-form">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                disabled={loading}
              />
              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setShowCommentForm(false)}
                  className="cancel-button"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="submit-button"
                  disabled={loading}
                >
                  {loading ? "Adding..." : "Add Comment"}
                </button>
              </div>
            </form>
          )}

          <div className="comments-list">
            {comments.map((comment) => (
              <div key={comment.comment_id} className="comment-card">
                <div className="comment-header">
                  <span className="username">{comment.users?.username}</span>
                  <span className="page-number">
                    Page {comment.page_number}
                  </span>
                </div>
                <div className="comment-content">{comment.comment_text}</div>
                <div className="comment-footer">
                  {new Date(comment.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <ConfirmationDialog
          isOpen={true}
          onClose={() => setShowConfirmDialog(null)}
          onConfirm={() => handleApprovalAction(showConfirmDialog)}
          title={`Confirm ${
            showConfirmDialog.charAt(0).toUpperCase() +
            showConfirmDialog.slice(1)
          }`}
          confirmColor={
            showConfirmDialog === "approve"
              ? "green"
              : showConfirmDialog === "reject"
                ? "red"
                : "yellow"
          }
          message={
            <div className="confirmation-content">
              <p>
                {showConfirmDialog === "revert"
                  ? "Are you sure you want to revert your decision?"
                  : `Are you sure you want to ${showConfirmDialog} this document?`}
              </p>
              <textarea
                value={confirmReason}
                onChange={(e) => setConfirmReason(e.target.value)}
                placeholder="Add a reason (optional)"
                className="reason-input"
              />
            </div>
          }
        />
      )}
    </div>
  );
}

export default DocumentViewer;

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Shield, Lock, FileText, LogOut, CheckCircle2, 
  Upload, Download, Share2, ShieldCheck, AlertCircle, Trash2 
} from 'lucide-react';

axios.defaults.baseURL = 'https://trustvault-n402.onrender.com';
axios.defaults.withCredentials = true;

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

interface DocumentItem {
  id: string;
  title: string;
  original_filename: string;
  size_bytes: number;
  category: string;
  owner_name: string;
  permission: string;
}

interface AuditEvent {
  sequence_number: string;
  timestamp: string;
  action: string;
  actor_email: string;
  outcome: string;
  current_hash: string;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState('');

  // Tabs
  const [activeTab, setActiveTab] = useState<'DOCUMENTS' | 'AUDIT'>('DOCUMENTS');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [verification, setVerification] = useState<{ valid: boolean; totalEvents: number } | null>(null);

  // Upload Form
  const [fileTitle, setFileTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');

  useEffect(() => {
    axios.get('/api/auth/me')
      .then(res => {
        setCurrentUser(res.data.user);
        loadDocuments();
      })
      .catch(() => setCurrentUser(null));
  }, []);

  const loadDocuments = async () => {
    try {
      const res = await axios.get('/api/documents');
      setDocuments(res.data.documents);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAuditTrail = async () => {
    try {
      const res = await axios.get('/api/admin/audit');
      setAuditEvents(res.data.events);
    } catch (err) {
      console.error(err);
    }
  };

  const loginWithCredentials = async (loginEmail: string, loginPass: string) => {
    setError('');
    try {
      const res = await axios.post('/api/auth/login', { email: loginEmail, password: loginPass });
      setCurrentUser(res.data.user);
      loadDocuments();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  const handleLogout = async () => {
    await axios.post('/api/auth/logout');
    setCurrentUser(null);
    setDocuments([]);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('title', fileTitle || selectedFile.name);
    formData.append('category', 'GENERAL');

    try {
      setUploadStatus('Uploading securely...');
      await axios.post('/api/documents/upload', formData);
      setUploadStatus('✅ File uploaded successfully!');
      setSelectedFile(null);
      setFileTitle('');
      loadDocuments();
    } catch (err: any) {
      setUploadStatus('❌ ' + (err.response?.data?.error || 'Upload failed'));
    }
  };

  const handleDownload = async (docId: string, filename: string) => {
    try {
      const res = await axios.get(`/api/documents/${docId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Access Denied: You do not possess valid permission to download this file.');
    }
  };

  const handleShareWithBob = async (docId: string) => {
    try {
      await axios.post(`/api/documents/${docId}/share`, {
        targetEmail: 'bob@trustvault.local',
        permissionLevel: 'READ',
      });
      alert('✅ Granted READ access to bob@trustvault.local');
      loadDocuments();
    } catch (err: any) {
      alert('Error: ' + (err.response?.data?.error || 'Share failed'));
    }
  };

  const handleRevokeFromBob = async (docId: string) => {
    try {
      await axios.post(`/api/documents/${docId}/revoke`, {
        targetEmail: 'bob@trustvault.local',
      });
      alert('🔒 Access revoked immediately from bob@trustvault.local');
      loadDocuments();
    } catch (err: any) {
      alert('Error: ' + (err.response?.data?.error || 'Revoke failed'));
    }
  };

  const verifyAuditChain = async () => {
    try {
      const res = await axios.get('/api/admin/audit/verify');
      setVerification(res.data);
    } catch (err) {
      alert('Audit verification check failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Navbar */}
      <nav className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3">
          <Shield className="w-7 h-7 text-blue-400" />
          <span className="text-xl font-bold tracking-tight">TrustVault</span>
          <span className="text-xs bg-blue-950 border border-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full font-mono">
            v1.0 Secure
          </span>
        </div>

        {currentUser && (
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm font-medium text-slate-100">{currentUser.fullName}</div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                {currentUser.role}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-sm transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto">
        {!currentUser ? (
          /* LOGIN SCREEN */
          <div className="max-w-md mx-auto my-12 bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            <div className="text-center mb-6">
              <div className="inline-flex p-3 rounded-full bg-blue-50 border border-blue-100 text-blue-600 mb-3">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Sign in to TrustVault</h2>
              <p className="text-sm text-slate-500 mt-1">Verifiable, role-isolated document vault</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">
                Click to Sign In with Demo Account:
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => loginWithCredentials('alice@trustvault.local', 'Password123!')}
                  className="px-2 py-2 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-semibold transition"
                >
                  Alice (Owner)
                </button>
                <button
                  type="button"
                  onClick={() => loginWithCredentials('bob@trustvault.local', 'Password123!')}
                  className="px-2 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-semibold transition"
                >
                  Bob (Viewer)
                </button>
                <button
                  type="button"
                  onClick={() => loginWithCredentials('charlie@trustvault.local', 'Password123!')}
                  className="px-2 py-2 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg font-semibold transition"
                >
                  Charlie (Admin)
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* AUTHENTICATED VAULT */
          <div className="space-y-6">
            {/* Header Tabs */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-200">
              <div className="flex space-x-3">
                <button
                  onClick={() => { setActiveTab('DOCUMENTS'); loadDocuments(); }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    activeTab === 'DOCUMENTS' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  📁 Vault Documents
                </button>
                <button
                  onClick={() => { setActiveTab('AUDIT'); loadAuditTrail(); }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    activeTab === 'AUDIT' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  🛡️ Cryptographic Audit Trail
                </button>
              </div>
            </div>

            {activeTab === 'DOCUMENTS' ? (
              <div className="space-y-6">
                {/* Upload Section (Only for Owner and Admin) */}
                {currentUser.role !== 'VIEWER' && (
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-base font-bold text-slate-900 mb-3 flex items-center space-x-2">
                      <Upload className="w-5 h-5 text-blue-600" />
                      <span>Upload Confidential Document</span>
                    </h3>
                    <form onSubmit={handleUpload} className="flex flex-col md:flex-row gap-3">
                      <input
                        type="text"
                        placeholder="Document Title (e.g. Q3 Financial Report)"
                        value={fileTitle}
                        onChange={e => setFileTitle(e.target.value)}
                        className="flex-1 px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <input
                        type="file"
                        onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                        className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        required
                      />
                      <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition"
                      >
                        Upload to Vault
                      </button>
                    </form>
                    {uploadStatus && <p className="text-xs font-semibold mt-2 text-slate-700">{uploadStatus}</p>}
                  </div>
                )}

                {/* Documents Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 font-semibold text-sm text-slate-700">
                    Accessible Documents ({documents.length})
                  </div>
                  {documents.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-sm">
                      No documents in vault yet. Choose a file above and click Upload!
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                          <th className="px-6 py-3 text-left">Document</th>
                          <th className="px-6 py-3 text-left">Owner</th>
                          <th className="px-6 py-3 text-left">Your Access</th>
                          <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {documents.map(doc => (
                          <tr key={doc.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 flex items-center space-x-3">
                              <FileText className="w-5 h-5 text-blue-600" />
                              <div>
                                <p className="font-semibold text-slate-900">{doc.title}</p>
                                <p className="text-xs text-slate-400">{doc.original_filename}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-600">{doc.owner_name}</td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                                {doc.permission}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                              <button
                                onClick={() => handleDownload(doc.id, doc.original_filename)}
                                className="px-3 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-md text-xs font-semibold inline-flex items-center space-x-1"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download</span>
                              </button>

                              {doc.permission === 'OWNER' && (
                                <>
                                  <button
                                    onClick={() => handleShareWithBob(doc.id)}
                                    className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md text-xs font-semibold inline-flex items-center space-x-1"
                                  >
                                    <Share2 className="w-3.5 h-3.5" />
                                    <span>Share to Bob</span>
                                  </button>
                                  <button
                                    onClick={() => handleRevokeFromBob(doc.id)}
                                    className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-md text-xs font-semibold inline-flex items-center space-x-1"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Revoke Bob</span>
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              /* AUDIT TRAIL TAB */
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">SHA-256 Tamper-Evident Audit Trail</h3>
                    <p className="text-xs text-slate-500">Every login, upload, grant, and download denial is cryptographically chained.</p>
                  </div>
                  <button
                    onClick={verifyAuditChain}
                    className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify Cryptographic Integrity</span>
                  </button>
                </div>

                {verification && (
                  <div className={`p-4 rounded-xl border flex items-center space-x-3 ${
                    verification.valid ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
                  }`}>
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold">
                        {verification.valid ? 'Cryptographic Chain 100% Valid!' : 'Chain Tampering Detected!'}
                      </p>
                      <p className="text-xs">
                        All {verification.totalEvents} audit blocks verified sequentially against previous hashes.
                      </p>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Seq</th>
                        <th className="px-4 py-2.5 text-left">Action</th>
                        <th className="px-4 py-2.5 text-left">Actor</th>
                        <th className="px-4 py-2.5 text-left">Outcome</th>
                        <th className="px-4 py-2.5 text-left">Hash Digest</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {auditEvents.map(ev => (
                        <tr key={ev.sequence_number} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-mono">{ev.sequence_number}</td>
                          <td className="px-4 py-2.5 font-bold text-slate-800">{ev.action}</td>
                          <td className="px-4 py-2.5 text-slate-600">{ev.actor_email || 'SYSTEM'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full font-bold ${
                              ev.outcome === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {ev.outcome}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-400" title={ev.current_hash}>
                            {ev.current_hash.slice(0, 12)}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

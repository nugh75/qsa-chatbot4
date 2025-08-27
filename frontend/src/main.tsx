import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import AdminPanel from './AdminPanel'
import SurveyResults from './SurveyResults'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      {/* Alias route for admin panel (both old and new path) */}
      <Route path="/admin-qsa-settings" element={<AdminPanel />} />
      <Route path="/admin" element={<AdminPanel />} />
      {/* Survey results dedicated route */}
      <Route path="/survey-results" element={<SurveyResults />} />
    </Routes>
  </BrowserRouter>
)

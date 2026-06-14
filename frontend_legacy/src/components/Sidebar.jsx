import React from 'react';
import { Link } from 'react-router-dom';

export default function Sidebar() {
  return (
    <nav className="space-y-2 p-3">
      <div>
        <Link to="/treasury" className="text-slate-200">Treasury</Link>
      </div>
      <div>
        <Link to="/explorer" className="text-slate-200">Explorer</Link>
      </div>
    </nav>
  );
}
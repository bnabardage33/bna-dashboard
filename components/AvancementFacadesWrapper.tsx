"use client";

import React from "react";
import AvancementFacades from "@/components/AvancementFacades";

interface State { hasError: boolean; message: string }

class AvancementErrorBoundary extends React.Component<{ chantierId: string }, State> {
  constructor(props: { chantierId: string }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("AvancementFacades crash:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-[#1E1E1E] border border-rose-500/30 rounded-xl p-4 text-sm text-rose-400">
          ⚠️ Le module d&apos;avancement n&apos;a pas pu se charger.
          <span className="block text-xs text-gray-500 mt-1">{this.state.message}</span>
        </div>
      );
    }
    return <AvancementFacades chantierId={this.props.chantierId} />;
  }
}

export default AvancementErrorBoundary;

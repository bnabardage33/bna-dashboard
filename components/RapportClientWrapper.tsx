"use client";

import React from "react";
import RapportClient from "@/components/RapportClient";

interface State {
  hasError: boolean;
  message: string;
}

class RapportClientErrorBoundary extends React.Component<{ chantierId: string }, State> {
  constructor(props: { chantierId: string }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("RapportClient crash:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          ⚠️ Le module des rapports client n&apos;a pas pu se charger.
          <span className="mt-1 block text-xs text-rose-600">{this.state.message}</span>
        </div>
      );
    }
    return <RapportClient chantierId={this.props.chantierId} />;
  }
}

export default RapportClientErrorBoundary;
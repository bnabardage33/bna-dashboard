"use client";

import React from "react";
import AvancementFacades, { type AvancementFacadesProps } from "@/components/AvancementFacades";

interface State {
  hasError: boolean;
  message: string;
}

class AvancementErrorBoundary extends React.Component<AvancementFacadesProps, State> {
  constructor(props: AvancementFacadesProps) {
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
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
          ⚠️ Le module d&apos;avancement n&apos;a pas pu se charger.
          <span className="block text-xs text-gray-500 mt-1">{this.state.message}</span>
        </div>
      );
    }
    return <AvancementFacades {...this.props} />;
  }
}

export default AvancementErrorBoundary;

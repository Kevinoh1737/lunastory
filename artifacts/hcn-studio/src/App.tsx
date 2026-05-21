import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route, Switch, Redirect, Link, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import AssetCreator from "@/pages/asset-creator";
import TaskList from "@/pages/task-list";
import VideoTaskList from "@/pages/video-task-list";
import VideoStudio from "@/pages/video-studio";
import OnHandPage from "@/pages/inventory/on-hand";
import SkuListPage from "@/pages/inventory/sku-list";
import SkuDetailPage from "@/pages/inventory/sku-detail";
import SalesImportPage from "@/pages/inventory/sales-import";
import { LoginGate } from "@/components/login-gate";

const queryClient = new QueryClient();

function SimpleHeader() {
  const [location] = useLocation();
  const isProductDevActive = location.startsWith("/tasks") || location.startsWith("/videos");
  const isInventoryActive = location.startsWith("/inventory");

  return (
    <header className="h-14 flex-none border-b border-[#3a3a3a] bg-[#252525] flex items-center px-6 gap-6 sticky top-0 z-40">
      <Link href="/tasks" className="flex items-center hover:opacity-80 transition-opacity">
        <img
          src="/luna-story-logo.png"
          alt="LUNA STORY"
          className="h-5 w-auto"
          style={{ filter: "brightness(0) invert(1)" }}
        />
      </Link>
      <div className="h-5 w-px bg-[#3a3a3a]" />
      <nav className="flex gap-1 items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded transition-colors outline-none ${
                isProductDevActive
                  ? "bg-[#333] text-[#4a9cf6]"
                  : "text-[#9ca3af] hover:text-[#e8e8e8] hover:bg-[#333]"
              }`}
            >
              제품 개발
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="bg-[#2a2a2a] border-[#3a3a3a] text-[#e8e8e8] min-w-[160px]"
          >
            <DropdownMenuItem asChild>
              <Link
                href="/tasks"
                className={`cursor-pointer px-3 py-2 text-sm rounded transition-colors w-full block ${
                  location.startsWith("/tasks")
                    ? "text-[#4a9cf6]"
                    : "text-[#9ca3af] hover:text-[#e8e8e8]"
                }`}
              >
                AI 이미지 생성
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/videos"
                className={`cursor-pointer px-3 py-2 text-sm rounded transition-colors w-full block ${
                  location.startsWith("/videos")
                    ? "text-[#4a9cf6]"
                    : "text-[#9ca3af] hover:text-[#e8e8e8]"
                }`}
              >
                AI 동영상 생성
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="px-3 py-1.5 text-sm font-medium rounded text-[#9ca3af] opacity-50 cursor-not-allowed select-none"
            >
              마케팅
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-[#333] border-[#3a3a3a] text-[#9ca3af] text-xs">
            준비 중
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded transition-colors outline-none ${
                isInventoryActive
                  ? "bg-[#333] text-[#4a9cf6]"
                  : "text-[#9ca3af] hover:text-[#e8e8e8] hover:bg-[#333]"
              }`}
            >
              제품 관리
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="bg-[#2a2a2a] border-[#3a3a3a] text-[#e8e8e8] min-w-[160px]"
          >
            <DropdownMenuItem asChild>
              <Link
                href="/inventory/on-hand"
                className={`cursor-pointer px-3 py-2 text-sm rounded transition-colors w-full block ${
                  location.startsWith("/inventory/on-hand")
                    ? "text-[#4a9cf6]"
                    : "text-[#9ca3af] hover:text-[#e8e8e8]"
                }`}
              >
                현재 재고
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/inventory/skus"
                className={`cursor-pointer px-3 py-2 text-sm rounded transition-colors w-full block ${
                  location === "/inventory/skus" || location.startsWith("/inventory/skus/")
                    ? "text-[#4a9cf6]"
                    : "text-[#9ca3af] hover:text-[#e8e8e8]"
                }`}
              >
                SKU 마스터
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/inventory/sales-import"
                className={`cursor-pointer px-3 py-2 text-sm rounded transition-colors w-full block ${
                  location.startsWith("/inventory/sales-import")
                    ? "text-[#4a9cf6]"
                    : "text-[#9ca3af] hover:text-[#e8e8e8]"
                }`}
              >
                판매 데이터 가져오기
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>
  );
}

function AppContent() {
  const [location] = useLocation();
  const isAssetCreatorRoute = /^\/tasks\/\d+/.test(location);
  const isVideoStudioRoute = /^\/videos\/\d+/.test(location);
  const isFullscreenRoute = isAssetCreatorRoute || isVideoStudioRoute;

  return (
    <div className={`${isFullscreenRoute ? "h-screen flex flex-col overflow-hidden" : "min-h-screen"} bg-[#1e1e1e]`}>
      {!isFullscreenRoute && <SimpleHeader />}
      <Switch>
        <Route path="/" component={() => <Redirect to="/tasks" />} />
        <Route path="/tasks" component={TaskList} />
        <Route path="/tasks/:id" component={AssetCreator} />
        <Route path="/videos" component={VideoTaskList} />
        <Route path="/videos/:id" component={VideoStudio} />
        <Route path="/inventory" component={() => <Redirect to="/inventory/on-hand" />} />
        <Route path="/inventory/on-hand" component={OnHandPage} />
        <Route path="/inventory/skus" component={SkuListPage} />
        <Route path="/inventory/skus/:code" component={SkuDetailPage} />
        <Route path="/inventory/sales-import" component={SalesImportPage} />
        <Route component={() => <Redirect to="/tasks" />} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LoginGate>
          <Router>
            <AppContent />
          </Router>
        </LoginGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

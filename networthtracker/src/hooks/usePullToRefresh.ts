"use client";

// 下拉更新。
//
// 原生 App 的第一直覺就是往下拉，先前唯一的更新入口是主卡右上角一顆 16px 的 icon，
// 很多人根本找不到。這裡用 touch 事件實作：只有在捲動容器已經到頂時才接手，
// 否則完全不干擾正常捲動。

import { useCallback, useEffect, useRef, useState } from "react";

const TRIGGER_DISTANCE = 72; // 拉到這個距離放開才觸發
const MAX_PULL = 110; // 視覺上最多拉這麼長，再拉也不會變長
const RESISTANCE = 0.5; // 手指移動距離要打對折，模擬橡皮筋阻力

export function usePullToRefresh(
  scrollRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
  enabled = true
) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);

  const reset = useCallback(() => {
    startY.current = null;
    active.current = false;
    setPullDistance(0);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !enabled) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (refreshing || element.scrollTop > 0) return;
      startY.current = event.touches[0].clientY;
      active.current = false;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (startY.current == null || refreshing) return;

      const delta = event.touches[0].clientY - startY.current;
      // 往上滑、或期間捲動離開頂端，就把主導權交還給瀏覽器
      if (delta <= 0 || element.scrollTop > 0) {
        if (active.current) reset();
        return;
      }

      active.current = true;
      setPullDistance(Math.min(MAX_PULL, delta * RESISTANCE));
    };

    const handleTouchEnd = () => {
      if (startY.current == null) return;
      const shouldRefresh = active.current && pullDistance >= TRIGGER_DISTANCE;
      startY.current = null;
      active.current = false;

      if (!shouldRefresh) {
        setPullDistance(0);
        return;
      }

      setRefreshing(true);
      setPullDistance(TRIGGER_DISTANCE);
      void Promise.resolve(onRefresh()).finally(() => {
        setRefreshing(false);
        setPullDistance(0);
      });
    };

    // passive: true——我們不呼叫 preventDefault（會擋掉 iOS 的原生彈性捲動），
    // 只是讀取位移來畫出下拉指示器
    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: true });
    element.addEventListener("touchend", handleTouchEnd);
    element.addEventListener("touchcancel", reset);

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", reset);
    };
  }, [scrollRef, enabled, refreshing, pullDistance, onRefresh, reset]);

  return {
    pullDistance,
    refreshing,
    /** 0～1，給指示器做旋轉／透明度動畫 */
    progress: Math.min(1, pullDistance / TRIGGER_DISTANCE),
    armed: pullDistance >= TRIGGER_DISTANCE,
  };
}

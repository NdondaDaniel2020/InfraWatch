import React from "react";
import { TvWallboardPage } from "./wallboard/TvWallboardPage";

/**
 * Interface dedicada em modo fullscreen para televisores de parede (NOC TV Wallboard).
 * Re-exporta a implementação canônica de TvWallboardPage garantindo compatibilidade com
 * a especificação da Tarefa 7.6 / Issue #30.
 */
export const NocTvWallboard: React.FC = () => {
  return <TvWallboardPage />;
};

export default NocTvWallboard;

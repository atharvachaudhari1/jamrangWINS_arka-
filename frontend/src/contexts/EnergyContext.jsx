import React, { createContext, useContext, useState } from "react";

const EnergyContext = createContext();
export const useEnergy = () => useContext(EnergyContext);

export function EnergyProvider({ children }) {
  const [energy, setEnergyState] = useState(() => {
    return parseInt(localStorage.getItem("bb-energy") || "3", 10);
  });

  function setEnergy(level) {
    setEnergyState(level);
    localStorage.setItem("bb-energy", String(level));
  }

  return (
    <EnergyContext.Provider value={{ energy, setEnergy }}>
      {children}
    </EnergyContext.Provider>
  );
}

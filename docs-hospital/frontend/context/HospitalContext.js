import React, { createContext, useContext, useReducer } from 'react';

// Initial state
const initialState = {
  user: null,
  hospitalType: 'ospedale',
  configuration: {
    ehr: { connected: false, system: '', endpoint: '' },
    cup: { connected: false, system: '', endpoint: '' },
    departments: [],
    services: []
  },
  documentation: {
    currentModule: 'overview',
    progress: {},
    bookmarks: []
  },
  simulator: {
    active: false,
    scenario: null,
    results: []
  }
};

// Actions
const ACTIONS = {
  SET_USER: 'SET_USER',
  SET_HOSPITAL_TYPE: 'SET_HOSPITAL_TYPE',
  UPDATE_CONFIGURATION: 'UPDATE_CONFIGURATION',
  SET_DOCUMENTATION_MODULE: 'SET_DOCUMENTATION_MODULE',
  UPDATE_PROGRESS: 'UPDATE_PROGRESS',
  TOGGLE_SIMULATOR: 'TOGGLE_SIMULATOR',
  SET_SIMULATOR_SCENARIO: 'SET_SIMULATOR_SCENARIO',
  ADD_SIMULATOR_RESULT: 'ADD_SIMULATOR_RESULT'
};

// Reducer
function hospitalReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_USER:
      return { ...state, user: action.payload };
    
    case ACTIONS.SET_HOSPITAL_TYPE:
      return { ...state, hospitalType: action.payload };
    
    case ACTIONS.UPDATE_CONFIGURATION:
      return {
        ...state,
        configuration: { ...state.configuration, ...action.payload }
      };
    
    case ACTIONS.SET_DOCUMENTATION_MODULE:
      return {
        ...state,
        documentation: { ...state.documentation, currentModule: action.payload }
      };
    
    case ACTIONS.UPDATE_PROGRESS:
      return {
        ...state,
        documentation: {
          ...state.documentation,
          progress: { ...state.documentation.progress, ...action.payload }
        }
      };
    
    case ACTIONS.TOGGLE_SIMULATOR:
      return {
        ...state,
        simulator: { ...state.simulator, active: action.payload }
      };
    
    case ACTIONS.SET_SIMULATOR_SCENARIO:
      return {
        ...state,
        simulator: { ...state.simulator, scenario: action.payload }
      };
    
    case ACTIONS.ADD_SIMULATOR_RESULT:
      return {
        ...state,
        simulator: {
          ...state.simulator,
          results: [...state.simulator.results, action.payload]
        }
      };
    
    default:
      return state;
  }
}

// Context
const HospitalContext = createContext();

// Provider component
export function HospitalProvider({ children }) {
  const [state, dispatch] = useReducer(hospitalReducer, initialState);

  const value = {
    ...state,
    setUser: (user) => dispatch({ type: ACTIONS.SET_USER, payload: user }),
    setHospitalType: (type) => dispatch({ type: ACTIONS.SET_HOSPITAL_TYPE, payload: type }),
    updateConfiguration: (config) => dispatch({ type: ACTIONS.UPDATE_CONFIGURATION, payload: config }),
    setDocumentationModule: (module) => dispatch({ type: ACTIONS.SET_DOCUMENTATION_MODULE, payload: module }),
    updateProgress: (progress) => dispatch({ type: ACTIONS.UPDATE_PROGRESS, payload: progress }),
    toggleSimulator: (active) => dispatch({ type: ACTIONS.TOGGLE_SIMULATOR, payload: active }),
    setSimulatorScenario: (scenario) => dispatch({ type: ACTIONS.SET_SIMULATOR_SCENARIO, payload: scenario }),
    addSimulatorResult: (result) => dispatch({ type: ACTIONS.ADD_SIMULATOR_RESULT, payload: result })
  };

  return (
    <HospitalContext.Provider value={value}>
      {children}
    </HospitalContext.Provider>
  );
}

// Hook to use the context
export function useHospital() {
  const context = useContext(HospitalContext);
  if (!context) {
    throw new Error('useHospital must be used within a HospitalProvider');
  }
  return context;
}
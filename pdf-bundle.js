import { jsPDF } from 'jspdf';

if (typeof window !== 'undefined') {
  window.jsPDF = jsPDF;
  window.jspdf = { jsPDF };
}

export { jsPDF };

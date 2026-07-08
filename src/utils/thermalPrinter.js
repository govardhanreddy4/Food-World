/**
 * thermalPrinter.js
 * -----------------
 * Web Bluetooth ESC/POS thermal printer utility for Niyama BT-58 (58mm).
 * Uses navigator.bluetooth to open a raw GATT communication stream and
 * write binary ESC/POS command sequences to the print head.
 *
 * Usage:
 *   import { printOrderToken, printKOTToken } from './thermalPrinter';
 *   await printOrderToken(order);
 */

// ─── ESC/POS Command Bytes ─────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;

const CMD = {
  INIT:          [ESC, 0x40],             // Initialize printer
  ALIGN_LEFT:    [ESC, 0x61, 0x00],       // Left align
  ALIGN_CENTER:  [ESC, 0x61, 0x01],       // Center align
  ALIGN_RIGHT:   [ESC, 0x61, 0x02],       // Right align
  BOLD_ON:       [ESC, 0x45, 0x01],       // Bold on
  BOLD_OFF:      [ESC, 0x45, 0x00],       // Bold off
  FONT_LARGE:    [GS,  0x21, 0x11],       // Double width + height
  FONT_MEDIUM:   [GS,  0x21, 0x01],       // Double width
  FONT_NORMAL:   [GS,  0x21, 0x00],       // Normal size
  CUT_PAPER:     [GS,  0x56, 0x41, 0x03], // Partial cut with feed
  LINE_FEED:     [0x0a],                  // Single line feed
};

const PAPER_WIDTH = 32; // 58mm paper ≈ 32 chars

// ─── Known ESC/POS GATT Service / Characteristic UUIDs ────────────────────
const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Physical Niyama Channel
];

const PRINTER_CHAR_UUIDS = [
  '000018f1-0000-1000-8000-00805f9b34fb', // Write characteristic (standard)
  '0000ff02-0000-1000-8000-00805f9b34fb', // Common write characteristic
  '0000ffe1-0000-1000-8000-00805f9b34fb', // Another common write char
];

// ─── Text Formatting Helpers ───────────────────────────────────────────────

function pad(str, width, align = 'left') {
  const s = String(str || '').substring(0, width);
  if (align === 'right') return s.padStart(width, ' ');
  if (align === 'center') {
    const totalPad = width - s.length;
    const left = Math.floor(totalPad / 2);
    return ' '.repeat(left) + s + ' '.repeat(totalPad - left);
  }
  return s.padEnd(width, ' ');
}

function separator() {
  return '-'.repeat(PAPER_WIDTH) + '\n';
}

function twoCol(left, right) {
  const leftWidth = PAPER_WIDTH - right.length;
  return pad(left, leftWidth, 'left') + pad(right, right.length, 'right') + '\n';
}

// ─── Receipt Formatter ─────────────────────────────────────────────────────

export function formatOrderReceipt(order, restaurantName = 'FOOD WORLD', settings = null) {
  const bytes = [];
  const encoder = new TextEncoder();

  const addBytes = (arr) => bytes.push(...arr);
  const addText = (text) => addBytes(Array.from(encoder.encode(text)));

  const title = settings?.customer?.restaurantTitle || restaurantName;
  const greeting = settings?.customer?.footnoteGreeting || 'Thank you! Visit again!';
  const includeTotalItemCount = settings?.customer?.includeTotalItemCount ?? false;
  const showCategoryLabels = settings?.customer?.showCategoryLabels ?? false;
  const doubleHeightTotals = settings?.customer?.doubleHeightTotals ?? false;

  // Initialize Printer
  addBytes(CMD.INIT);

  // Header - Center Align
  addBytes(CMD.ALIGN_CENTER);
  addBytes(CMD.BOLD_ON);
  addText(separator());
  addText(pad(title.toUpperCase(), PAPER_WIDTH, 'center') + '\n');
  addText(separator());
  addBytes(CMD.BOLD_OFF);

  // Date & Time - Left Align Items
  addBytes(CMD.ALIGN_LEFT);
  const orderDate = order.createdAt?.toDate?.() || new Date(order.createdAt) || new Date();
  const dateStr = orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  addText(`Date: ${dateStr}  ${timeStr}\n`);

  // Table / Fulfillment Type
  const tableNo = String(order.tableNumber || '').toUpperCase();
  const fulfillment = (order.fulfillmentType || 'dine-in').toUpperCase();
  const tableLabel = tableNo === 'PARCEL' ? 'Parcel / Takeaway' : `Table ${order.tableNumber}`;
  addText(`${tableLabel}  [${fulfillment}]\n`);

  addText(separator());

  // Items
  let grandTotal = 0;
  let itemCount = 0;
  
  order.orderBatches?.forEach((batch, bIdx) => {
    if (order.orderBatches.length > 1) {
      addText(`-- Order ${bIdx + 1} --\n`);
    }
    batch.items?.forEach((item) => {
      const qty    = item.quantity || 1;
      const name   = String(item.name || '');
      const price  = Number(item.price || 0) * qty;
      grandTotal  += price;
      itemCount   += qty;

      if (showCategoryLabels && item.category) {
        addText(`[${item.category.toUpperCase()}]\n`);
      }

      const priceStr = `Rs.${price.toFixed(0)}`;
      const qtyLabel = `${qty}x `;

      const maxNameLen = PAPER_WIDTH - qtyLabel.length - priceStr.length - 1;
      const truncName  = name.substring(0, maxNameLen);
      addText(twoCol(`${qtyLabel}${truncName}`, priceStr));
    });
    if (batch.notes) {
      addText(`  Note: ${batch.notes.substring(0, PAPER_WIDTH - 8)}\n`);
    }
  });

  addText(separator());

  if (includeTotalItemCount) {
    addText(twoCol('Total Items:', String(itemCount)));
    addText(separator());
  }

  // Total
  const totalStr = `Rs.${Number(order.totalAmount || grandTotal).toFixed(2)}`;
  if (doubleHeightTotals) addBytes(CMD.FONT_LARGE);
  else addBytes(CMD.BOLD_ON);
  
  if (doubleHeightTotals) {
    addBytes(CMD.ALIGN_CENTER);
    addText(`TOTAL: ${totalStr}\n`);
    addBytes(CMD.FONT_NORMAL);
    addBytes(CMD.ALIGN_LEFT);
  } else {
    addText(twoCol('TOTAL AMOUNT:', totalStr));
    addBytes(CMD.BOLD_OFF);
  }

  addText(separator());
  addBytes(CMD.ALIGN_CENTER);
  addText(pad(greeting, PAPER_WIDTH, 'center') + '\n');
  addText(separator());

  // Line Feed & Paper Cut Margin
  addText('\n\n\n\n');
  addBytes(CMD.CUT_PAPER);

  return new Uint8Array(bytes);
}

// ─── Staff KOT Formatter ───────────────────────────────────────────────────

export function generateStaffKOTBytes(order, batch, settings = null) {
  const bytes = [];
  const encoder = new TextEncoder();
  const addBytes = (arr) => bytes.push(...arr);
  const addText = (text) => addBytes(Array.from(encoder.encode(text)));

  const s = settings?.kot || {
    includeHeader: true,
    showTimestamps: true,
    largeTableNumbers: true,
    includeBatchNumber: true,
  };

  addBytes(CMD.INIT);
  addBytes(CMD.ALIGN_CENTER);

  if (s.includeHeader) {
    addBytes(CMD.BOLD_ON);
    addText(separator());
    addText(pad("KITCHEN ORDER TICKET", PAPER_WIDTH, 'center') + '\n');
    addText(separator());
    addBytes(CMD.BOLD_OFF);
  }

  const tableNo = String(order.tableNumber || '').toUpperCase();
  const fulfillment = (batch.fulfillmentType || order.fulfillmentType || 'dine-in').toUpperCase();
  const tableLabel = tableNo === 'PARCEL' ? 'PARCEL' : `TABLE ${order.tableNumber}`;

  if (s.largeTableNumbers) {
    addBytes(CMD.FONT_LARGE);
    addText(`${tableLabel}\n`);
    addBytes(CMD.FONT_NORMAL);
  } else {
    addBytes(CMD.BOLD_ON);
    addText(`${tableLabel}\n`);
    addBytes(CMD.BOLD_OFF);
  }
  
  addBytes(CMD.ALIGN_CENTER);
  addText(`[${fulfillment}]\n\n`);
  addBytes(CMD.ALIGN_LEFT);

  if (s.showTimestamps) {
    const d = batch.timestamp?.toDate?.() || new Date();
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    addText(`Time: ${timeStr}\n`);
  }

  if (s.includeBatchNumber) {
    const bIdx = order.orderBatches?.findIndex(b => b.id === batch.id) || 0;
    addText(`Batch: ${bIdx + 1}\n`);
  }

  addText(separator());

  // Items
  batch.items?.forEach((item) => {
    const qty = item.quantity || 1;
    const name = String(item.name || '').toUpperCase();
    addBytes(CMD.BOLD_ON);
    addText(`[ ] ${qty}x ${name}\n`);
    addBytes(CMD.BOLD_OFF);
  });

  if (batch.notes) {
    addText(separator());
    addText(`NOTE: ${batch.notes}\n`);
  }

  addText(separator());
  addText('\n\n\n\n');
  addBytes(CMD.CUT_PAPER);

  return new Uint8Array(bytes);
}

// ─── Global Connection Cache & Queue ───────────────────────────────────────
export let cachedBillingDevice = null;
export let cachedBillingCharacteristic = null;

export let cachedKitchenDevice = null;
export let cachedKitchenCharacteristic = null;

// Event listeners for React UI updates
const statusListeners = new Set();
function emitStatusChange() {
  statusListeners.forEach(listener => listener({
    billing: cachedBillingDevice?.gatt?.connected || false,
    kitchen: cachedKitchenDevice?.gatt?.connected || false
  }));
}
export function subscribeToPrinterStatus(callback) {
  statusListeners.add(callback);
  callback({
    billing: cachedBillingDevice?.gatt?.connected || false,
    kitchen: cachedKitchenDevice?.gatt?.connected || false
  });
  return () => statusListeners.delete(callback);
}

let printQueue = [];
let isProcessingQueue = false;

async function processNextJob() {
  if (isProcessingQueue || printQueue.length === 0) return;
  isProcessingQueue = true;
  
  const nextJob = printQueue.shift();
  const { payload, onConnecting, resolve, reject, isRetry, type } = nextJob;
  
  try {
    const result = await _executeBluetoothPrint(payload, onConnecting, type);
    if (!result.success && result.error && !isRetry) {
      // If we failed (e.g. disconnected) but have the payload, maybe retry once after clearing cache?
      // For simplicity, we just return the error to the caller.
      reject(new Error(result.error));
    } else {
      resolve(result);
    }
  } catch (error) {
    console.error("Queue execution fault:", error);
    reject(error);
  }
  
  isProcessingQueue = false;
  // Trigger next job in the queue
  processNextJob();
}

// ─── Core Bluetooth Print Function ────────────────────────────────────────

async function _executeBluetoothPrint(payload, onConnecting = null, type = 'billing') {
  if (!navigator.bluetooth) {
    return { success: false, error: 'Web Bluetooth API is not supported in this browser. Please use Chrome or Edge on Android/Desktop.' };
  }
  const CHUNK_SIZE = 20;

  const isBilling = type === 'billing';
  let cachedDevice = isBilling ? cachedBillingDevice : cachedKitchenDevice;
  let cachedChar = isBilling ? cachedBillingCharacteristic : cachedKitchenCharacteristic;

  if (cachedDevice && cachedDevice.gatt.connected && cachedChar) {
    console.log(`Reusing existing cached ${type} printer connection...`);
    if (onConnecting) onConnecting();
    try {
      for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
        const chunk = payload.slice(i, i + CHUNK_SIZE);
        await cachedChar.writeValue(chunk);
        await new Promise(res => setTimeout(res, 10));
      }
      return { success: true };
    } catch (err) {
      console.warn(`Cached ${type} connection failed, clearing cache...`, err);
      if (isBilling) {
        cachedBillingDevice = null;
        cachedBillingCharacteristic = null;
      } else {
        cachedKitchenDevice = null;
        cachedKitchenCharacteristic = null;
      }
      emitStatusChange();
    }
  }

  let device = null;
  let server = null;

  try {
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
    });
  } catch (scanErr) {
    if (
      scanErr.name === 'NotFoundError' ||
      scanErr.name === 'AbortError' ||
      scanErr.message?.toLowerCase().includes('cancel') ||
      scanErr.message?.toLowerCase().includes('abort')
    ) {
      return { success: false, cancelled: true };
    }
    return { success: false, error: `Bluetooth scan failed: ${scanErr.message}` };
  }

  if (onConnecting) onConnecting();

  try {
    server = await device.gatt.connect();

    let printerService = null;
    for (const serviceUUID of PRINTER_SERVICE_UUIDS) {
      try {
        printerService = await server.getPrimaryService(serviceUUID);
        if (printerService) break;
      } catch (_) {}
    }
    if (!printerService) {
      throw new Error('No compatible printer GATT service found. Please make sure the Niyama BT-58 is powered on and paired.');
    }

    let writeCharacteristic = null;
    for (const charUUID of PRINTER_CHAR_UUIDS) {
      try {
        const char = await printerService.getCharacteristic(charUUID);
        if (char?.properties?.writeWithoutResponse || char?.properties?.write) {
          writeCharacteristic = char;
          break;
        }
      } catch (_) {}
    }

    if (!writeCharacteristic) {
      const allChars = await printerService.getCharacteristics();
      for (const char of allChars) {
        if (char.properties.writeWithoutResponse || char.properties.write) {
          writeCharacteristic = char;
          break;
        }
      }
    }

    if (!writeCharacteristic) {
      throw new Error('No writable print characteristic found on this device.');
    }

    if (isBilling) {
      cachedBillingDevice = device;
      cachedBillingCharacteristic = writeCharacteristic;
    } else {
      cachedKitchenDevice = device;
      cachedKitchenCharacteristic = writeCharacteristic;
    }
    emitStatusChange();

    device.addEventListener('gattserverdisconnected', () => {
      console.log(`${type} Printer disconnected, clearing cache.`);
      if (isBilling) {
        cachedBillingDevice = null;
        cachedBillingCharacteristic = null;
      } else {
        cachedKitchenDevice = null;
        cachedKitchenCharacteristic = null;
      }
      emitStatusChange();
    });

    console.log('%c[Thermal Printer] Generated Binary Payload (bytes):\n', 'color: #3b82f6; font-weight: bold;', payload.length);

    for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
      const chunk = payload.slice(i, i + CHUNK_SIZE);
      await writeCharacteristic.writeValue(chunk);
      await new Promise(res => setTimeout(res, 10));
    }
    return { success: true };

  } catch (err) {
    console.error('Thermal print error:', err);
    return { success: false, error: err.message || 'Unknown print error occurred.' };
  }
}

async function executeBluetoothPrint(payload, onConnecting = null, type = 'billing') {
  return new Promise((resolve, reject) => {
    printQueue.push({ payload, onConnecting, resolve, reject, isRetry: false, type });
    processNextJob();
  });
}

export async function printOrderToken(order, restaurantName = 'FOOD WORLD', onConnecting = null, settings = null) {
  const hardware = settings?.hardware || {};
  if (hardware.isCustomerHardwareOn === false) {
    console.log("Customer receipt printing bypassed via settings.");
    return { success: true, bypassed: true };
  }
  const payload = formatOrderReceipt(order, restaurantName, settings);
  return await executeBluetoothPrint(payload, onConnecting, 'billing');
}

export async function printKOTToken(order, batch, settings = null, onConnecting = null) {
  const hardware = settings?.hardware || {};
  if (hardware.isKitchenHardwareOn === false) {
    console.log("Kitchen KOT printing bypassed via settings.");
    return { success: true, bypassed: true };
  }
  const targetType = hardware.hardwareMode === '1_device' ? 'billing' : 'kitchen';
  const payload = generateStaffKOTBytes(order, batch, settings);
  return await executeBluetoothPrint(payload, onConnecting, targetType);
}

// ─── Manual Connection Control ──────────────────────────────────────────────

export async function connectStationPrinter(type = 'billing') {
  try {
    // We send an empty payload (or just initialization commands) to pair the device without printing anything meaningful.
    // Or we just call _executeBluetoothPrint with an empty array if that works?
    // Let's send a single INIT command to wake up the printer and lock the connection.
    const initPayload = new Uint8Array([0x1B, 0x40]); 
    const result = await _executeBluetoothPrint(initPayload, null, type);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function disconnectStationPrinter(type = 'billing') {
  try {
    if (type === 'billing' && cachedBillingDevice) {
      if (cachedBillingDevice.gatt && cachedBillingDevice.gatt.connected) {
        await cachedBillingDevice.gatt.disconnect();
      }
      cachedBillingDevice = null;
      cachedBillingCharacteristic = null;
    } else if (type === 'kitchen' && cachedKitchenDevice) {
      if (cachedKitchenDevice.gatt && cachedKitchenDevice.gatt.connected) {
        await cachedKitchenDevice.gatt.disconnect();
      }
      cachedKitchenDevice = null;
      cachedKitchenCharacteristic = null;
    }
    emitStatusChange();
    return { success: true };
  } catch (error) {
    console.error(`Failed to disconnect ${type} printer:`, error);
    return { success: false, error: error.message };
  }
}

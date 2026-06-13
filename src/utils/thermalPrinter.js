/**
 * thermalPrinter.js
 * -----------------
 * Web Bluetooth ESC/POS thermal printer utility for Niyama BT-58 (58mm).
 * Uses navigator.bluetooth to open a raw GATT communication stream and
 * write binary ESC/POS command sequences to the print head.
 *
 * Usage:
 *   import { printOrderToken } from './thermalPrinter';
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
  '00001101-0000-1000-8000-00805f9b34fb', // Virtual Simulator Channel
];

const PRINTER_CHAR_UUIDS = [
  '000018f1-0000-1000-8000-00805f9b34fb', // Write characteristic (standard)
  '0000ff02-0000-1000-8000-00805f9b34fb', // Common write characteristic
  '0000ffe1-0000-1000-8000-00805f9b34fb', // Another common write char
];

// ─── Text Formatting Helpers ───────────────────────────────────────────────

/**
 * Pad/truncate a string to exactly `width` characters.
 */
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

/**
 * Create a separator line of dashes.
 */
function separator() {
  return '-'.repeat(PAPER_WIDTH) + '\n';
}

/**
 * Format a two-column row (left label, right value).
 */
function twoCol(left, right) {
  const leftWidth = PAPER_WIDTH - right.length;
  return pad(left, leftWidth, 'left') + pad(right, right.length, 'right') + '\n';
}

// ─── Receipt Formatter ─────────────────────────────────────────────────────

/**
 * Builds a complete 58mm-formatted text receipt from an order object.
 * @param {object} order - Firestore order document
 * @param {string} restaurantName - Name of the restaurant
 * @returns {string} formatted receipt text
 */
export function formatOrderReceipt(order, restaurantName = 'FOOD WORLD') {
  const lines = [];

  // Header
  lines.push(separator());
  lines.push(pad(restaurantName.toUpperCase(), PAPER_WIDTH, 'center') + '\n');
  lines.push(separator());

  // Date & Time
  const orderDate = order.createdAt?.toDate?.() || new Date(order.createdAt) || new Date();
  const dateStr = orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  lines.push(`Date: ${dateStr}  ${timeStr}\n`);

  // Table / Fulfillment Type
  const tableNo = String(order.tableNumber || '').toUpperCase();
  const fulfillment = (order.fulfillmentType || 'dine-in').toUpperCase();
  const tableLabel = tableNo === 'PARCEL' ? 'Parcel / Takeaway' : `Table ${order.tableNumber}`;
  lines.push(`${tableLabel}  [${fulfillment}]\n`);

  lines.push(separator());

  // Items
  let grandTotal = 0;
  order.orderBatches?.forEach((batch, bIdx) => {
    if (order.orderBatches.length > 1) {
      lines.push(`-- Order ${bIdx + 1} --\n`);
    }
    batch.items?.forEach((item) => {
      const qty    = item.quantity || 1;
      const name   = String(item.name || '');
      const price  = Number(item.price || 0) * qty;
      grandTotal  += price;

      const priceStr = `\u20B9${price.toFixed(0)}`;
      const qtyLabel = `${qty}x `;

      // Truncate name so line doesn't overflow 32 chars
      const maxNameLen = PAPER_WIDTH - qtyLabel.length - priceStr.length - 1;
      const truncName  = name.substring(0, maxNameLen);
      lines.push(twoCol(`${qtyLabel}${truncName}`, priceStr));
    });
    if (batch.notes) {
      lines.push(`  Note: ${batch.notes.substring(0, PAPER_WIDTH - 8)}\n`);
    }
  });

  lines.push(separator());

  // Total
  const totalStr = `\u20B9${Number(order.totalAmount || grandTotal).toFixed(2)}`;
  lines.push(twoCol('TOTAL AMOUNT:', totalStr));

  lines.push(separator());
  lines.push(pad('Thank you! Visit again!', PAPER_WIDTH, 'center') + '\n');
  lines.push(separator());

  // 3 trailing line feeds for paper margin
  lines.push('\n\n\n');

  return lines.join('');
}

// ─── Core Bluetooth Print Function ────────────────────────────────────────

/**
 * Discovers and connects to a Bluetooth thermal printer, then writes
 * the formatted receipt as ESC/POS binary bytes.
 *
 * @param {object} order - Firestore order document
 * @param {string} restaurantName - Restaurant display name
 * @param {function} onConnecting - Callback fired after device selection, before GATT connect
 * @returns {Promise<{success: boolean, error?: string, cancelled?: boolean}>}
 */
export async function printOrderToken(order, restaurantName = 'FOOD WORLD', onConnecting = null) {
  if (!navigator.bluetooth) {
    return { success: false, error: 'Web Bluetooth API is not supported in this browser. Please use Chrome or Edge on Android/Desktop.' };
  }

  let device = null;
  let server = null;

  try {
    // 1. Request Bluetooth device — use acceptAllDevices so every paired printer appears.
    //    Name-prefix filters are too strict and hide the printer when it has a generic name.
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICE_UUIDS,
    });
  } catch (scanErr) {
    // User pressed Cancel in the picker — silent abort, no alert needed.
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

  // Trigger the UI loading spinner now that the browser picker is complete
  if (onConnecting) onConnecting();

  try {
    // 2. Connect to GATT server
    server = await device.gatt.connect();

    // 3. Find a supported printer service
    let printerService = null;
    for (const serviceUUID of PRINTER_SERVICE_UUIDS) {
      try {
        printerService = await server.getPrimaryService(serviceUUID);
        if (printerService) break;
      } catch (_) {
        // Try next UUID
      }
    }

    if (!printerService) {
      throw new Error('No compatible printer GATT service found. Please make sure the Niyama BT-58 is powered on and paired.');
    }

    // 4. Find a writable characteristic
    let writeCharacteristic = null;
    for (const charUUID of PRINTER_CHAR_UUIDS) {
      try {
        const char = await printerService.getCharacteristic(charUUID);
        if (char?.properties?.writeWithoutResponse || char?.properties?.write) {
          writeCharacteristic = char;
          break;
        }
      } catch (_) {
        // Try next UUID
      }
    }

    // Fallback: iterate all characteristics and find first writable one
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

    // 5. Build the print payload (Pure text for maximum simulator compatibility)
    const encoder   = new TextEncoder();
    const receiptText = formatOrderReceipt(order, restaurantName);
    
    // Debug log the exact receipt text layout to the console for easy verification
    console.log('%c[Thermal Printer] Generated Receipt Text:\n', 'color: #3b82f6; font-weight: bold;', receiptText);

    // Some virtual simulators throw exceptions on raw ESC/POS binary styling commands.
    // Since our JS formatter already perfectly pads and spaces the 32-character layout, 
    // we can send a pure, clean ASCII text stream to ensure total compatibility.
    const receiptBytes = encoder.encode(receiptText);
    
    // Standard hardware feed/cut suffix (optional, simulators usually ignore this gracefully)
    const cutBytes = new Uint8Array([0x1d, 0x56, 0x41, 0x03]); // GS V A 3

    // Merge text payload and cut command
    const totalLength = receiptBytes.length + cutBytes.length;
    const payload = new Uint8Array(totalLength);
    payload.set(receiptBytes, 0);
    payload.set(cutBytes, receiptBytes.length);

    // 6. Write the payload in 512-byte chunks (BLE MTU safety)
    const CHUNK_SIZE = 512;
    const writeMethod = writeCharacteristic.properties.writeWithoutResponse
      ? 'writeValueWithoutResponse'
      : 'writeValue';

    for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
      const chunk = payload.slice(i, i + CHUNK_SIZE);
      await writeCharacteristic[writeMethod](chunk);
      // Small delay between chunks to prevent buffer overrun
      await new Promise(res => setTimeout(res, 50));
    }

    return { success: true };

  } catch (err) {
    console.error('Thermal print error:', err);
    return { success: false, error: err.message || 'Unknown print error occurred.' };
  } finally {
    // Always disconnect GATT to free up the BLE connection
    if (server?.connected) {
      try { server.disconnect(); } catch (_) {}
    }
  }
}

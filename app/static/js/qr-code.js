// qr-code.js

function generateCustomQRCode(elementId, data, options = {}) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`Element with id '${elementId}' not found`);
        return;
    }

    // Clear any existing content
    element.innerHTML = '';

    const size = options.size || 300;
    const dotScale = options.dotScale || 0.65;
    const cornerRadius = options.cornerRadius || 15;
    const logoSize = options.logoSize || size * 0.2;
    const dotRadius = options.dotRadius || 2;

    console.log('Generating QR code with options:', { size, dotScale, cornerRadius, logoSize, dotRadius });

    // Create a temporary container for the QR code
    const tempContainer = document.createElement('div');
    new QRCode(tempContainer, {
        text: data,
        width: size,
        height: size,
        colorDark: options.color || "#000000",
        colorLight: options.background || "#ffffff",
        correctLevel: QRCode.CorrectLevel.H // Highest error correction level
    });

    // Get the QR code as an image
    const qrImage = tempContainer.querySelector('img');
    
    qrImage.onload = function() {
        console.log('QR Image loaded');
        console.log('QR Image dimensions:', qrImage.width, qrImage.height);

        // Create the final canvas
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        console.log('Canvas dimensions:', canvas.width, canvas.height);

        // Function to draw rounded rectangle
        function drawRoundedRect(x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.arcTo(x + width, y, x + width, y + height, radius);
            ctx.arcTo(x + width, y + height, x, y + height, radius);
            ctx.arcTo(x, y + height, x, y, radius);
            ctx.arcTo(x, y, x + width, y, radius);
            ctx.closePath();
        }

        // Draw background with rounded corners
        ctx.fillStyle = options.background || "#ffffff";
        drawRoundedRect(0, 0, size, size, cornerRadius);
        ctx.fill();

        // Create a clipping path for the entire QR code
        ctx.save();
        drawRoundedRect(0, 0, size, size, cornerRadius);
        ctx.clip();

        // Draw the QR code
        ctx.drawImage(qrImage, 0, 0, size, size);

        // Get image data
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;

        console.log('Image data length:', data.length);

        // Clear the canvas
        ctx.clearRect(0, 0, size, size);

        // Redraw background with rounded corners
        ctx.fillStyle = options.background || "#ffffff";
        drawRoundedRect(0, 0, size, size, cornerRadius);
        ctx.fill();

        // Draw dots
        const dotSize = size / qrImage.naturalWidth;
        ctx.fillStyle = options.color || "#000000";

        console.log('Dot size:', dotSize);

        let dotsDrawn = 0;

        for (let y = 0; y < size; y += dotSize) {
            for (let x = 0; x < size; x += dotSize) {
                const index = (Math.floor(y) * size + Math.floor(x)) * 4;
                if (data[index] < 128) { // Dark pixel
                    const centerX = x + dotSize / 2;
                    const centerY = y + dotSize / 2;
                    const radius = Math.min((dotSize * dotScale) / 2, dotRadius);

                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                    ctx.fill();
                    dotsDrawn++;
                }
            }
        }

        console.log('Dots drawn:', dotsDrawn);

        ctx.restore();

        // If a logo is provided, draw it on top of the QR code
        if (options.logo) {
            console.log('Drawing logo');
            const logo = new Image();
            logo.onload = function() {
                const logoX = (size - logoSize) / 2;
                const logoY = (size - logoSize) / 2;

                // Create a circular clipping path for the logo
                ctx.save();
                ctx.beginPath();
                ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.clip();

                // Draw the logo
                ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
                ctx.restore();

                // Add the canvas to the DOM
                element.appendChild(canvas);
                console.log('QR code generation complete');
            };
            logo.src = options.logo;
        } else {
            // If no logo, just add the canvas to the DOM
            element.appendChild(canvas);
            console.log('QR code generation complete (no logo)');
        }
    };
}

// Export the function
export { generateCustomQRCode };
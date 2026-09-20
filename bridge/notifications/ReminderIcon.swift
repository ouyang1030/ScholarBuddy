import AppKit

// Match the diamond and lime accents of ScholarBuddy's sidebar brand mark.
let directory = CommandLine.arguments[1]
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        let transform = NSAffineTransform()
        transform.scale(by: CGFloat(pixels) / 1024)
        transform.concat()
        NSColor(srgbRed: 12/255, green: 17/255, blue: 16/255, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 32, y: 32, width: 960, height: 960), xRadius: 216, yRadius: 216).fill()
        let brand = NSAffineTransform()
        brand.translateX(by: 512, yBy: 512)
        brand.rotate(byDegrees: -45)
        brand.concat()
        NSColor(srgbRed: 125/255, green: 139/255, blue: 132/255, alpha: 1).setStroke()
        let diamond = NSBezierPath(roundedRect: NSRect(x: -230, y: -230, width: 460, height: 460), xRadius: 27, yRadius: 27)
        diamond.lineWidth = 14
        diamond.stroke()
        NSColor(srgbRed: 183/255, green: 237/255, blue: 98/255, alpha: 1).setFill()
        NSBezierPath(ovalIn: NSRect(x: -170, y: 62, width: 108, height: 108)).fill()
        NSBezierPath(rect: NSRect(x: 48, y: -150, width: 122, height: 14)).fill()
        NSGraphicsContext.restoreGraphicsState()
        let suffix = scale == 2 ? "@2x" : ""
        try bitmap.representation(using: .png, properties: [:])!.write(to:
            URL(fileURLWithPath: directory).appendingPathComponent("icon_\(size)x\(size)\(suffix).png"))
    }
}

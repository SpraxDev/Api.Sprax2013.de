ALTER TABLE
    "skin_urls"
ADD CHECK (
    starts_with("url", 'https://') AND (strpos("url", '.minecraft.net/') > 0 OR strpos("url", '.mojang.com/') > 0)
);
